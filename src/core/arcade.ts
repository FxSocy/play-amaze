/**
 * Arcade features: the things on an Arcade maze that a plain maze has no idea
 * about — portals, keys, locked gates and one-way doors — plus the pathfinding
 * that understands them.
 *
 * Two rules shape everything here:
 *
 * 1. **The maze is always finishable, from anywhere the player can get to.**
 *    A feature that can strand a player is a bug, not a difficulty. Placement
 *    checks this before it accepts a layout, and `arcade.test.ts` re-checks it
 *    across many seeds.
 * 2. **The route the game shows is a route the player can actually walk.** Hints
 *    and the give-up route both come from `planRoute`, which spends keys, opens
 *    gates, respects one-way doors and travels through portals exactly as the
 *    player would, so the game never points at a door it knows is locked.
 *
 * Like `daily.ts`, this file decides what a seed means: changing it changes past
 * Arcade mazes for every player. Treat the numbers as frozen.
 */

import {
  canMove,
  cellCount,
  DIRECTIONS,
  DIRECTION_LIST,
  neighbor,
  openNeighbors,
  type Direction,
  type Maze
} from './maze'
import { createRng, type Rng } from './rng'
import { bfs, findPath } from './solver'

/**
 * How many Arcade features a custom maze asks for. The three dailies have their
 * own fixed standards in `daily.ts`; this is the dial a player gets.
 */
export type ArcadeLevel = 'off' | 'light' | 'full'
export const ARCADE_LEVELS: readonly ArcadeLevel[] = ['off', 'light', 'full']
export const ARCADE_LABELS: Record<ArcadeLevel, string> = { off: 'Off', light: 'Light', full: 'Full' }

/** How many of each feature an Arcade maze carries. */
export interface ArcadeSpec {
  portalPairs: number
  gates: number
  oneWays: number
  /** Mystery boxes, which are the only source of a wall-break charge. */
  boxes: number
}

/**
 * What a mystery box turns out to hold: two outcomes worth having, two worth
 * avoiding. A box is always a gamble, so the good ones have to be good enough
 * to make a dead end tempting and the bad ones bad enough to make it a real
 * decision.
 */
export const MYSTERY_OUTCOMES = ['break', 'jump', 'restart', 'blind'] as const
export type MysteryOutcome = (typeof MYSTERY_OUTCOMES)[number]

export const MYSTERY_IS_GOOD: Record<MysteryOutcome, boolean> = {
  break: true,
  jump: true,
  restart: false,
  blind: false
}

export const MYSTERY_LABELS: Record<MysteryOutcome, string> = {
  break: 'Wall-break charge',
  jump: 'Wall jump',
  restart: 'Back to the start',
  blind: 'Lights out'
}

export const MYSTERY_BLURBS: Record<MysteryOutcome, string> = {
  break: 'Arm it, then walk into a wall to smash through.',
  jump: 'Arm it, then hop over one wall. The wall stays.',
  restart: 'Back where you began. Your trail is still there.',
  blind: 'The lights go out for a few seconds.'
}

/** A little something for each outcome to spin past on the reel. */
export const MYSTERY_ICONS: Record<MysteryOutcome, string> = {
  break: '🧨',
  jump: '🦘',
  restart: '⏮',
  blind: '🌑'
}

/**
 * Where every feature sits, as flat per-cell lookups so the renderer and the
 * pathfinder can ask about a cell without searching.
 */
export interface MazeFeatures {
  /** The cell this one teleports to, or -1. Always paired both ways. */
  portals: Int32Array
  /** Index into `keyCells` for a key pickup on this cell, or -1. */
  keyIndex: Int32Array
  /** Index into `gateCells` for a gate on this cell, or -1. */
  gateIndex: Int32Array
  /**
   * Directions the player may *not* leave this cell through — the back side of
   * a one-way door. The passage itself stays open, so it still draws as one.
   */
  oneWay: Uint8Array
  /** Index into `boxCells` for a mystery box on this cell, or -1. */
  boxIndex: Int32Array
  keyCells: number[]
  gateCells: number[]
  /** Mystery boxes, always at dead ends so reaching one is a detour you choose. */
  boxCells: number[]
  /** What each box in `boxCells` holds, decided by the seed. */
  boxOutcomes: MysteryOutcome[]
  portalPairs: [number, number][]
}

/** What the player is carrying and has already opened, as bitmasks over the cell lists. */
export interface RunState {
  keysHeld: number
  /** Key pickups already taken. */
  collected: number
  /** Gates already unlocked; they stay open. */
  opened: number
}

export const EMPTY_RUN_STATE: RunState = { keysHeld: 0, collected: 0, opened: 0 }

/**
 * Keys and gates are tracked as bitmasks in the route planner, so their counts
 * stay small enough for the search space to be trivial.
 */
export const MAX_KEYS = 4
export const MAX_GATES = 4

/**
 * Portals must not turn the maze into a three-move walk: a layout whose best
 * route is shorter than this fraction of the plain maze's is thrown away.
 */
const MIN_ROUTE_FRACTION = 0.5

/**
 * What a custom maze of this size gets at each level, or null for none.
 *
 * Portals and one-way doors scale with the area — two portals in a 90×56 maze
 * would be a rumour rather than a mechanic, and six in a 15×10 would be most of
 * the maze. Gates stay at one or two whatever the size: they are about pacing a
 * run, not about density, and each one costs the route planner a dimension.
 */
export function arcadeSpecFor(level: ArcadeLevel, width: number, height: number): ArcadeSpec | null {
  if (level === 'off') return null
  const cells = width * height
  const perArea = (per: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.round(cells / per)))
  return level === 'light'
    ? { portalPairs: perArea(700, 1, 3), gates: 1, oneWays: perArea(800, 1, 3), boxes: perArea(400, 2, 4) }
    : { portalPairs: perArea(300, 2, 6), gates: 2, oneWays: perArea(350, 2, 6), boxes: perArea(200, 3, 8) }
}

export function emptyFeatures(maze: Maze): MazeFeatures {
  const n = cellCount(maze)
  return {
    portals: new Int32Array(n).fill(-1),
    keyIndex: new Int32Array(n).fill(-1),
    gateIndex: new Int32Array(n).fill(-1),
    boxIndex: new Int32Array(n).fill(-1),
    oneWay: new Uint8Array(n),
    keyCells: [],
    gateCells: [],
    boxCells: [],
    boxOutcomes: [],
    portalPairs: []
  }
}

const popcount = (n: number): number => {
  let count = 0
  for (let bits = n; bits; bits >>= 1) count += bits & 1
  return count
}

/** Whether the player may leave `cell` heading `dir` — a wall or a one-way door stops them. */
export function canLeave(maze: Maze, features: MazeFeatures, cell: number, dir: Direction): boolean {
  return canMove(maze, cell, dir) && (features.oneWay[cell] & DIRECTIONS[dir].wall) === 0
}

/** Where stepping onto `cell` actually lands the player: through a portal, or nowhere. */
export function portalExit(features: MazeFeatures, cell: number): number {
  const exit = features.portals[cell]
  return exit >= 0 ? exit : cell
}

/** A mystery box still waiting on `cell`. */
export function hasBox(features: MazeFeatures, opened: number, cell: number): boolean {
  const index = features.boxIndex[cell]
  return index >= 0 && (opened & (1 << index)) === 0
}

export function hasKey(features: MazeFeatures, state: RunState, cell: number): boolean {
  const index = features.keyIndex[cell]
  return index >= 0 && (state.collected & (1 << index)) === 0
}

export function isClosedGate(features: MazeFeatures, state: RunState, cell: number): boolean {
  const index = features.gateIndex[cell]
  return index >= 0 && (state.opened & (1 << index)) === 0
}

export interface RouteOptions {
  /** Restricts which cells the route may pass through; the origin is always allowed. */
  passable?: (cell: number) => boolean
  /**
   * False keeps the route out of portals, for routes that are walked one step
   * at a time: a step onto a portal ends up somewhere else entirely, which a
   * step-by-step walker cannot follow. The destination itself may still be one.
   */
  portals?: boolean
}

/**
 * A route from `from` to `to` that the player could walk right now, or null.
 *
 * The search runs over (cell, keys collected, gates opened) rather than cells
 * alone, so "the exit is locked, go and find a key first" falls out of it
 * instead of having to be special-cased. Consecutive cells in the result are
 * adjacent *or* a portal jump; callers that draw the route check for that.
 */
export function planRoute(
  maze: Maze,
  features: MazeFeatures,
  state: RunState,
  from: number,
  to: number,
  options: RouteOptions = {}
): number[] | null {
  const { passable, portals = true } = options
  const keyBits = 1 << features.keyCells.length
  const gateBits = 1 << features.gateCells.length
  const n = cellCount(maze)
  const size = n * keyBits * gateBits
  const encode = (cell: number, collected: number, opened: number): number =>
    (cell * keyBits + collected) * gateBits + opened

  const prev = new Int32Array(size).fill(-1)
  const seen = new Uint8Array(size)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0

  // Keys in hand are implied by how far the state has moved from the start,
  // so the search doesn't have to carry a count around.
  const keysAt = (collected: number, opened: number): number =>
    state.keysHeld +
    popcount(collected & ~state.collected) -
    popcount(opened & ~state.opened)

  const startState = encode(from, state.collected, state.opened)
  seen[startState] = 1
  queue[tail++] = startState

  while (head < tail) {
    const current = queue[head++]
    const opened = current % gateBits
    const collected = Math.floor(current / gateBits) % keyBits
    const cell = Math.floor(current / (gateBits * keyBits))
    if (cell === to) return reconstruct(prev, current, gateBits, keyBits, startState)

    for (const dir of DIRECTION_LIST) {
      if (!canLeave(maze, features, cell, dir)) continue
      const step = neighbor(maze, cell, dir)
      if (!portals && features.portals[step] >= 0 && step !== to) continue
      let nextOpened = opened
      if (isClosedGate(features, { ...state, opened }, step)) {
        if (keysAt(collected, opened) <= 0) continue
        nextOpened = opened | (1 << features.gateIndex[step])
      }
      const landing = portals ? portalExit(features, step) : step
      if (passable && !passable(landing)) continue
      let nextCollected = collected
      if (hasKey(features, { ...state, collected }, landing)) {
        nextCollected = collected | (1 << features.keyIndex[landing])
      }
      const next = encode(landing, nextCollected, nextOpened)
      if (seen[next]) continue
      seen[next] = 1
      prev[next] = current
      queue[tail++] = next
    }
  }
  return null
}

function reconstruct(
  prev: Int32Array,
  goal: number,
  gateBits: number,
  keyBits: number,
  start: number
): number[] {
  const cells: number[] = []
  for (let s = goal; s !== -1; s = s === start ? -1 : prev[s]) {
    cells.push(Math.floor(s / (gateBits * keyBits)))
  }
  return cells.reverse()
}

/**
 * The same maze with its keys taken away, so no gate on it can ever open. Asks
 * the question "could the player get there without a key?".
 */
export function withoutKeys(features: MazeFeatures): MazeFeatures {
  return {
    ...features,
    keyCells: [],
    keyIndex: new Int32Array(features.keyIndex.length).fill(-1)
  }
}

/** Shortest number of moves from the start of the run, counting a portal jump as one. */
export function optimalFeatureMoves(maze: Maze, features: MazeFeatures): number {
  const route = planRoute(maze, features, EMPTY_RUN_STATE, maze.start, maze.end)
  return route ? route.length - 1 : 0
}

/**
 * Whether the maze is solvable from the start *and* stays solvable wherever the
 * player wanders — the property one-way doors can destroy.
 *
 * The wander check treats every gate as open, which is the state a player is in
 * once they hold a key; gates can't strand anyone on their own, because keys
 * are always placed on the near side of every gate.
 */
export function isEscapable(maze: Maze, features: MazeFeatures): boolean {
  if (planRoute(maze, features, EMPTY_RUN_STATE, maze.start, maze.end) === null) return false

  const n = cellCount(maze)
  const forward = (cell: number): number[] => {
    const out: number[] = []
    for (const dir of DIRECTION_LIST) {
      if (canLeave(maze, features, cell, dir)) out.push(portalExit(features, neighbor(maze, cell, dir)))
    }
    return out
  }
  const backward: number[][] = Array.from({ length: n }, () => [])
  for (let cell = 0; cell < n; cell++) {
    for (const next of forward(cell)) backward[next].push(cell)
  }

  const reach = (start: number, edges: (cell: number) => number[]): Uint8Array => {
    const seen = new Uint8Array(n)
    const queue = [start]
    seen[start] = 1
    for (let i = 0; i < queue.length; i++) {
      for (const next of edges(queue[i])) {
        if (seen[next]) continue
        seen[next] = 1
        queue.push(next)
      }
    }
    return seen
  }

  const reachable = reach(maze.start, forward)
  const canFinish = reach(maze.end, (cell) => backward[cell])
  for (let cell = 0; cell < n; cell++) {
    if (reachable[cell] && !canFinish[cell]) return false
  }
  return true
}

/**
 * Places features on `maze` for `seed`. Deterministic: the same seed and maze
 * always produce the same layout, which is what makes a shared daily Arcade
 * maze fair.
 *
 * Each feature is placed under a rule that keeps the maze finishable:
 *
 * - **Gates** sit on the one route from start to exit, so they always matter,
 *   and every **key** is placed in the region the player can reach before the
 *   first gate, so the keys can always be found first.
 * - **One-way doors** are only placed on the run home, after the last gate:
 *   past that point nothing behind the player is needed again.
 * - **Portals** are extra two-way links, which can only help — except by making
 *   the maze too short, which is checked for.
 */
export function generateFeatures(maze: Maze, seed: string, spec: ArcadeSpec): MazeFeatures {
  const rng = createRng(seed)
  const features = emptyFeatures(maze)

  const main = findPath(maze, maze.start, maze.end)
  if (!main || main.length < 8) return features

  const taken = new Uint8Array(cellCount(maze))
  taken[maze.start] = 1
  taken[maze.end] = 1

  placeGatesAndKeys(maze, features, taken, main, Math.min(spec.gates, MAX_GATES, MAX_KEYS), rng)
  placeOneWays(maze, features, main, spec.oneWays, rng)
  placePortals(maze, features, taken, spec.portalPairs, rng)
  placeBoxes(maze, features, taken, spec.boxes, rng)

  return features
}

/**
 * Mystery boxes, and what each one holds.
 *
 * **Dead ends only.** A box on a corridor would be picked up in passing, which
 * is no decision at all; at the end of a branch, taking the gamble costs you
 * the walk there and back, and that is the whole point of it.
 *
 * Outcomes are dealt from a shuffled bag of all four rather than rolled one at
 * a time, so a maze can't hand one player three trips back to the start and
 * another three charges. Like everything else here it comes from the seed: the
 * reel in front of the player is theatre over a result already decided.
 *
 * Boxes are never needed to finish, and the route planner knows nothing about
 * them — a planned route never enters a dead end, so it never walks into one.
 */
function placeBoxes(maze: Maze, features: MazeFeatures, taken: Uint8Array, count: number, rng: Rng): void {
  if (count <= 0) return
  const deadEnds: number[] = []
  for (let cell = 0; cell < taken.length; cell++) {
    if (taken[cell] || features.oneWay[cell] !== 0) continue
    if (openNeighbors(maze, cell).length === 1) deadEnds.push(cell)
  }
  rng.shuffle(deadEnds)

  let bag: MysteryOutcome[] = []
  for (const cell of deadEnds.slice(0, count)) {
    if (bag.length === 0) bag = rng.shuffle([...MYSTERY_OUTCOMES])
    taken[cell] = 1
    features.boxIndex[cell] = features.boxCells.length
    features.boxCells.push(cell)
    features.boxOutcomes.push(bag.pop()!)
  }
}

/**
 * Gates go on the main path, spread out along its second half; each gate's key
 * goes somewhere the player can reach without passing any of them.
 */
function placeGatesAndKeys(
  maze: Maze,
  features: MazeFeatures,
  taken: Uint8Array,
  main: number[],
  count: number,
  rng: Rng
): void {
  if (count <= 0) return
  // Gates live in the middle third of the route. Earlier than that and the
  // player meets one before they have explored anything; later and there is no
  // run home left for the one-way doors, which are only safe after the last gate.
  const candidates = main.slice(Math.floor(main.length * 0.3), Math.floor(main.length * 0.7))
  if (candidates.length < count) return

  const gates: number[] = []
  const span = Math.floor(candidates.length / count)
  for (let i = 0; i < count && span > 0; i++) {
    const cell = candidates[i * span + rng.int(span)]
    if (taken[cell]) continue
    taken[cell] = 1
    gates.push(cell)
  }
  if (gates.length === 0) return

  // Everywhere the player can go before meeting a gate; the keys must live here.
  const beforeGates = bfs(maze, maze.start, { passable: (cell) => !gates.includes(cell) })
  const reachable: number[] = []
  for (let cell = 0; cell < taken.length; cell++) {
    if (beforeGates.dist[cell] > 0 && !taken[cell]) reachable.push(cell)
  }
  if (reachable.length < gates.length) return

  // Dead ends make the better hiding places: a key on a corridor is picked up
  // by accident, a key at the end of a branch is a detour the player chooses.
  const deadEnds = reachable.filter((cell) => openNeighbors(maze, cell).length === 1)
  const pool = deadEnds.length >= gates.length ? deadEnds : reachable
  rng.shuffle(pool)

  for (const gate of gates) {
    features.gateIndex[gate] = features.gateCells.length
    features.gateCells.push(gate)
  }
  for (let i = 0; i < gates.length; i++) {
    const cell = pool[i]
    taken[cell] = 1
    features.keyIndex[cell] = features.keyCells.length
    features.keyCells.push(cell)
  }
}

/**
 * One-way doors close behind the player on the stretch between the last gate
 * and the exit, so nothing they still need is ever left on the far side.
 */
function placeOneWays(maze: Maze, features: MazeFeatures, main: number[], count: number, rng: Rng): void {
  if (count <= 0) return
  const lastGate = features.gateCells.reduce((latest, gate) => Math.max(latest, main.indexOf(gate)), -1)
  // Leave a couple of cells of run-up after the last gate, and stop short of the exit.
  const first = Math.max(1, lastGate + 2)
  const steps: number[] = []
  for (let i = first; i < main.length - 2; i++) steps.push(i)
  if (steps.length === 0) return

  rng.shuffle(steps)
  let placed = 0
  for (const step of steps) {
    if (placed >= count) break
    const from = main[step]
    const to = main[step + 1]
    const dir = DIRECTION_LIST.find((d) => neighbor(maze, from, d) === to)
    if (!dir) continue
    const back = DIRECTIONS[DIRECTIONS[dir].opposite].wall
    features.oneWay[to] |= back
    if (isEscapable(maze, features)) {
      placed++
    } else {
      // Belt and braces: the stretch after the last gate should always be safe,
      // so this only ever fires if that reasoning stops holding.
      features.oneWay[to] &= ~back
    }
  }
}

/** Portal pairs: two-way links between cells far enough apart to be worth taking. */
function placePortals(
  maze: Maze,
  features: MazeFeatures,
  taken: Uint8Array,
  pairs: number,
  rng: Rng
): void {
  if (pairs <= 0) return
  const plain = findPath(maze, maze.start, maze.end)?.length ?? 0
  const minJump = Math.max(4, Math.floor((maze.width + maze.height) / 3))

  const free: number[] = []
  for (let cell = 0; cell < taken.length; cell++) {
    // A portal under a one-way door would be two mechanics on one cell.
    if (!taken[cell] && features.oneWay[cell] === 0) free.push(cell)
  }
  rng.shuffle(free)

  for (let placed = 0; placed < pairs; ) {
    const a = free.pop()
    if (a === undefined) return
    const { dist } = bfs(maze, a)
    const partner = free.find((cell) => dist[cell] >= minJump)
    if (partner === undefined) continue
    free.splice(free.indexOf(partner), 1)

    features.portals[a] = partner
    features.portals[partner] = a
    // Two ways a pair can spoil the maze: by turning it into a sprint, or by
    // jumping the player past a gate, which would make its key pointless.
    const tooShort = plain > 0 && optimalFeatureMoves(maze, features) < plain * MIN_ROUTE_FRACTION
    const skipsGates =
      features.gateCells.length > 0 &&
      planRoute(maze, withoutKeys(features), EMPTY_RUN_STATE, maze.start, maze.end) !== null
    if (tooShort || skipsGates) {
      features.portals[a] = -1
      features.portals[partner] = -1
      continue
    }
    taken[a] = 1
    taken[partner] = 1
    features.portalPairs.push([a, partner])
    placed++
  }
}
