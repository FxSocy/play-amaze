import {
  arcadeSpecFor,
  canLeave,
  generateFeatures,
  isClosedGate,
  optimalFeatureMoves,
  planRoute,
  type MazeFeatures,
  type MysteryOutcome,
  type RunState
} from './arcade'
import { arcadeSpec, dailyKind } from './daily'
import { generateMaze } from './generators'
import {
  canMove,
  carve,
  cellCount,
  directionBetween,
  DIRECTIONS,
  hasWall,
  neighbor,
  type Direction,
  type Maze
} from './maze'
import { FOG_LEVELS, resolveSize, type GameSettings } from './settings'
import { bfs, findPath } from './solver'

const popcount = (n: number): number => {
  let count = 0
  for (let bits = n; bits; bits >>= 1) count += bits & 1
  return count
}

/** How many upcoming solution steps a hint reveals. */
export const HINT_STEPS = 12
export const HINT_DURATION_MS = 4000

/**
 * How long the Daily Doozie shows its exit when the run starts. Its fog hides
 * the exit entirely, so a glimpse gives the player a direction to head in.
 */
export const EXIT_PEEK_MS = 3000

/** How long the mystery box reel spins before its result lands. */
export const MYSTERY_SPIN_MS = 2000
/**
 * How long "lights out" lasts, and how far you can see while it does: the same
 * radius as the densest fog, but with nothing remembered behind it.
 */
export const BLIND_MS = 4000
export const BLIND_RADIUS = FOG_LEVELS.dense.radius

/**
 * How far a drag may be filled in through cells the player has not walked. A
 * fast drag skips cells between pointer events; this closes those gaps without
 * letting the mouse solve stretches of maze the player never traced.
 */
export const TRACE_GAP_STEPS = 4

export interface ActiveHint {
  path: number[]
  expiresAt: number
}

/** A mystery box mid-spin. The outcome is already decided; the reel is showing it. */
export interface MysterySpin {
  cell: number
  outcome: MysteryOutcome
  endsAt: number
}

/**
 * All gameplay state for one maze run, independent of rendering and input.
 * Timestamps are passed in by the caller so the logic stays deterministic.
 */
export class GameSession {
  readonly maze: Maze
  readonly settings: GameSettings
  readonly seed: string
  readonly optimalMoves: number
  readonly fogRadius: number
  /** Cells the player has ever seen (always 1 when fog is off). */
  readonly explored: Uint8Array
  /** Cells currently within the player's vision radius. */
  readonly visible: Uint8Array
  /**
   * Passages the player has walked, as a per-cell bitmask using the WALL_*
   * bits for the side of the cell the passage leaves through.
   */
  readonly trail: Uint8Array
  /** Cells the player has actually stood in; mouse routes may only cross these. */
  readonly visited: Uint8Array
  /** Portals, keys, gates and one-way doors, or null on a plain maze. */
  readonly features: MazeFeatures | null

  player: number
  moves = 0
  hintsUsed = 0
  /** Keys picked up and not yet spent on a gate. */
  keysHeld = 0
  /** Wall-break charges picked up and not yet spent. The run starts with none. */
  breaksLeft = 0
  /** Whether the next blocked move spends a charge and smashes the wall instead. */
  breakArmed = false
  /** Wall jumps held: a hop to the far side of one wall, leaving it standing. */
  jumpsLeft = 0
  /** Whether the next blocked move spends a jump and hops the wall instead. */
  jumpArmed = false
  /** Key pickups taken, as a bitmask over the feature list. */
  collected = 0
  /** Gates unlocked; a gate that has been opened stays open. */
  opened = 0
  /** Mystery boxes already opened, as a bitmask over the feature list. */
  boxesOpened = 0
  /** The box being opened right now, or null. Everything is frozen while it spins. */
  mystery: MysterySpin | null = null
  /** When vision is squeezed to `BLIND_RADIUS` by a box, until this timestamp. */
  blindUntil: number | null = null
  startedAt: number | null = null
  /** Set when the run ends, whether solved or given up. */
  finishedAt: number | null = null
  gaveUp = false
  /** Route from where the player gave up to the exit. */
  solution: number[] | null = null
  hint: ActiveHint | null = null
  /**
   * True until begin() is called. Daily mazes stay hidden and locked until the
   * player presses Start, so the route can't be planned before the clock runs.
   */
  awaitingStart: boolean
  /** When the start-of-run glimpse of the exit ends, or null when there is none. */
  exitPeekUntil: number | null = null
  /** Incremented on every state change; lets UI layers subscribe cheaply. */
  version = 0

  /** Whether this maze glimpses its exit at the start of the run. */
  private readonly peeksExit: boolean
  /** The portal the player was just delivered to; inert until they step off it. */
  private portalCooldown = -1
  /** Ground the player had explored before "lights out" took the lights. */
  private rememberedExplored: Uint8Array | null = null
  private visibleCells: number[] = []
  private readonly listeners = new Set<() => void>()

  constructor(settings: GameSettings, seed: string) {
    this.settings = settings
    this.seed = seed
    this.maze = generateMaze({ ...resolveSize(settings), algorithm: settings.algorithm, seed })
    this.player = this.maze.start
    const spec =
      settings.seedMode === 'daily'
        ? arcadeSpec(seed)
        : arcadeSpecFor(settings.arcade, this.maze.width, this.maze.height)
    this.features = spec ? generateFeatures(this.maze, `${seed}:arcade`, spec) : null
    this.optimalMoves = this.features
      ? optimalFeatureMoves(this.maze, this.features)
      : (findPath(this.maze, this.maze.start, this.maze.end)?.length ?? 1) - 1
    this.fogRadius = FOG_LEVELS[settings.fog].radius
    this.awaitingStart = settings.seedMode === 'daily'
    this.peeksExit = settings.seedMode === 'daily' && dailyKind(seed) === 'doozie'

    const n = cellCount(this.maze)
    this.explored = new Uint8Array(n)
    this.visible = new Uint8Array(n)
    this.trail = new Uint8Array(n)
    this.visited = new Uint8Array(n)
    this.visited[this.player] = 1
    if (this.fogEnabled) {
      this.updateVision()
    } else {
      this.explored.fill(1)
      this.visible.fill(1)
    }
  }

  get fogEnabled(): boolean {
    return Number.isFinite(this.visionRadius)
  }

  get finished(): boolean {
    return this.finishedAt !== null
  }

  get solved(): boolean {
    return this.finished && !this.gaveUp
  }

  get hintsRemaining(): number {
    return this.settings.hints - this.hintsUsed
  }

  /** True on an Arcade maze, the only kind that carries features. */
  get isArcade(): boolean {
    return this.features !== null
  }

  /** What the player is carrying, in the form the route planner wants. */
  get runState(): RunState {
    return { keysHeld: this.keysHeld, collected: this.collected, opened: this.opened }
  }

  /** A key pickup still waiting on `cell`. */
  keyAt(cell: number): boolean {
    const index = this.features?.keyIndex[cell] ?? -1
    return index >= 0 && (this.collected & (1 << index)) === 0
  }

  /** A gate on `cell`, and whether the player has already unlocked it. */
  gateAt(cell: number): 'locked' | 'open' | null {
    const index = this.features?.gateIndex[cell] ?? -1
    if (index < 0) return null
    return (this.opened & (1 << index)) === 0 ? 'locked' : 'open'
  }

  /** Arms or disarms a wall-break charge. Returns whether it is now armed. */
  armBreak(armed = !this.breakArmed): boolean {
    this.breakArmed = armed && this.canSpend(this.breaksLeft)
    // Only one of the two can be waiting on the next move.
    if (this.breakArmed) this.jumpArmed = false
    this.changed()
    return this.breakArmed
  }

  /** Arms or disarms a wall jump. Returns whether it is now armed. */
  armJump(armed = !this.jumpArmed): boolean {
    this.jumpArmed = armed && this.canSpend(this.jumpsLeft)
    if (this.jumpArmed) this.breakArmed = false
    this.changed()
    return this.jumpArmed
  }

  private canSpend(held: number): boolean {
    return held > 0 && !this.finished && !this.awaitingStart && !this.busy
  }

  /** Milliseconds the clock has been stopped for, while boxes were spinning. */
  private pausedMs = 0
  private pausedAt: number | null = null

  elapsed(now: number): number {
    if (this.startedAt === null) return 0
    const paused = this.pausedMs + (this.pausedAt === null ? 0 : now - this.pausedAt)
    return (this.finishedAt ?? now) - this.startedAt - paused
  }

  /** True while a mystery box is spinning: the run is frozen and input ignored. */
  get busy(): boolean {
    return this.mystery !== null
  }

  /** A mystery box still unopened on `cell`. */
  boxAt(cell: number): boolean {
    const index = this.features?.boxIndex[cell] ?? -1
    return index >= 0 && (this.boxesOpened & (1 << index)) === 0
  }

  /** How many boxes are still out there, unopened. */
  get boxesLeft(): number {
    return (this.features?.boxCells.length ?? 0) - popcount(this.boxesOpened)
  }

  /** How far the player can see right now; a box can squeeze this temporarily. */
  get visionRadius(): number {
    return this.blindUntil === null ? this.fogRadius : Math.min(BLIND_RADIUS, this.fogRadius)
  }

  /**
   * Milliseconds left on the spin. When it reaches zero the outcome is applied
   * and the run resumes — so whatever is driving the frame loop also drives
   * this, and a stalled UI can never leave a player frozen.
   */
  mysteryRemaining(now: number): number {
    if (this.mystery === null) return 0
    const remaining = this.mystery.endsAt - now
    if (remaining > 0) return remaining
    this.applyMystery(this.mystery.outcome, now)
    this.mystery = null
    this.resumeClock(now)
    this.changed()
    return 0
  }

  /** Milliseconds left of "lights out"; 0 once vision is back. */
  blindRemaining(now: number): number {
    if (this.blindUntil === null) return 0
    const remaining = this.blindUntil - now
    if (remaining > 0) return remaining
    this.blindUntil = null
    this.restoreVision()
    this.changed()
    return 0
  }

  /** Reveals a start-gated maze and starts the clock. Returns false if it was already started. */
  begin(now: number): boolean {
    if (!this.awaitingStart) return false
    this.awaitingStart = false
    if (this.peeksExit) this.exitPeekUntil = now + EXIT_PEEK_MS
    this.startClock(now)
    this.changed()
    return true
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Moves one cell in `dir`. Returns whether the player moved.
   *
   * On an Arcade maze the step may also spend a wall-break charge, unlock a
   * gate, pick up a key or come out of a portal somewhere else entirely — but
   * it is still one move, so scores stay comparable with the other dailies.
   */
  move(dir: Direction, now: number): boolean {
    if (this.awaitingStart || this.finished || this.busy) return false
    // A blocked move can still happen, if a charge or a jump is armed for it.
    let jumped = false
    if (!this.canStep(this.player, dir)) {
      if (this.breakThrough(dir)) {
        // The wall is gone: from here on this is an ordinary step.
      } else if (this.hopOver(dir)) {
        jumped = true
      } else {
        return false
      }
    }
    this.startClock(now)
    const from = this.player
    const step = neighbor(this.maze, from, dir)
    // A jump goes over the wall, not through a passage, so it leaves no
    // breadcrumb: the trail is a record of where the maze can be walked.
    if (!jumped) {
      this.trail[from] |= DIRECTIONS[dir].wall
      this.trail[step] |= DIRECTIONS[DIRECTIONS[dir].opposite].wall
    }
    this.visited[step] = 1
    this.player = step
    if (this.features) this.applyFeatures(step, now)
    this.moves++
    if (this.fogEnabled) this.updateVision()
    if (this.player === this.maze.end) this.finishedAt = now
    this.changed()
    return true
  }

  /** Whether the player could leave `cell` heading `dir` right now. */
  private canStep(cell: number, dir: Direction): boolean {
    if (!this.features) return canMove(this.maze, cell, dir)
    if (!canLeave(this.maze, this.features, cell, dir)) return false
    const target = neighbor(this.maze, cell, dir)
    // A locked gate opens for a key; nothing else gets through it.
    return !isClosedGate(this.features, this.runState, target) || this.keysHeld > 0
  }

  /**
   * Spends a charge to smash the wall in `dir`, when one is armed. A charge only
   * ever breaks a wall: a locked gate is a door, and a one-way door is a rule,
   * so neither gives way to it.
   */
  private breakThrough(dir: Direction): boolean {
    if (!this.breakArmed || !this.blockedByWall(dir)) return false
    carve(this.maze, this.player, dir)
    this.breaksLeft--
    this.breakArmed = false
    return true
  }

  /**
   * Spends a jump to hop to the far side of the wall in `dir`, leaving the wall
   * where it is. Like a charge it only clears walls: a locked gate and a
   * one-way door are rules rather than obstacles, and neither is hopped.
   */
  private hopOver(dir: Direction): boolean {
    if (!this.jumpArmed || !this.blockedByWall(dir)) return false
    this.jumpsLeft--
    this.jumpArmed = false
    return true
  }

  /**
   * Whether `dir` is blocked by an actual wall with a cell worth reaching on the
   * other side — the only thing a charge or a jump is good for.
   *
   * The far side has to be enterable once the wall is dealt with, or a player
   * could spend their one charge smashing into a gate they still can't open.
   */
  private blockedByWall(dir: Direction): boolean {
    const target = neighbor(this.maze, this.player, dir)
    if (target < 0 || !hasWall(this.maze, this.player, dir)) return false
    if (!this.features) return true
    return !isClosedGate(this.features, this.runState, target) || this.keysHeld > 0
  }

  /** Applies whatever sits on the cell just stepped onto: a gate, a portal, a key. */
  private applyFeatures(step: number, now: number): void {
    const features = this.features!
    const gate = features.gateIndex[step]
    if (gate >= 0 && (this.opened & (1 << gate)) === 0) {
      this.opened |= 1 << gate
      this.keysHeld--
    }
    if (features.portals[step] >= 0 && this.portalCooldown !== step) {
      // Coming out of the far portal would otherwise send the player straight
      // back, so the exit portal stays inert until they step off it.
      const landing = features.portals[step]
      this.portalCooldown = landing
      this.player = landing
      this.visited[landing] = 1
    } else {
      this.portalCooldown = -1
    }
    const key = features.keyIndex[this.player]
    if (key >= 0 && (this.collected & (1 << key)) === 0) {
      this.collected |= 1 << key
      this.keysHeld++
    }
    if (this.boxAt(this.player)) this.openBox(this.player, now)
  }

  /**
   * Opening a mystery box. The outcome was decided by the seed when the maze
   * was made; this starts the reel that shows it, stops the clock and freezes
   * the run until `mysteryRemaining` runs out.
   */
  private openBox(cell: number, now: number): void {
    const features = this.features!
    const index = features.boxIndex[cell]
    if (index < 0 || (this.boxesOpened & (1 << index)) !== 0) return
    this.boxesOpened |= 1 << index
    this.mystery = { cell, outcome: features.boxOutcomes[index], endsAt: now + MYSTERY_SPIN_MS }
    this.breakArmed = false
    this.jumpArmed = false
    this.pauseClock(now)
  }

  /** What the box turned out to hold, applied when the reel stops. */
  private applyMystery(outcome: MysteryOutcome, now: number): void {
    switch (outcome) {
      case 'break':
        this.breaksLeft++
        return
      case 'jump':
        this.jumpsLeft++
        return
      case 'restart':
        // The trail and everything already found stay: it is the walk back that costs.
        this.player = this.maze.start
        this.portalCooldown = -1
        if (this.fogEnabled) this.updateVision()
        return
      case 'blind': {
        // Remembered ground goes dark too, or "lights out" on a fogless maze
        // would leave the whole map politely visible.
        this.rememberedExplored = this.explored.slice()
        this.explored.fill(0)
        this.visible.fill(0)
        this.visibleCells = []
        this.blindUntil = now + BLIND_MS
        this.updateVision()
        return
      }
    }
  }

  /** Puts back whatever "lights out" took away. */
  private restoreVision(): void {
    const remembered = this.rememberedExplored
    this.rememberedExplored = null
    if (remembered) {
      for (let cell = 0; cell < this.explored.length; cell++) this.explored[cell] |= remembered[cell]
    }
    if (this.fogEnabled) {
      this.updateVision()
      return
    }
    this.explored.fill(1)
    this.visible.fill(1)
    this.visibleCells = []
  }

  private pauseClock(now: number): void {
    if (this.pausedAt === null) this.pausedAt = now
  }

  private resumeClock(now: number): void {
    if (this.pausedAt === null) return
    this.pausedMs += now - this.pausedAt
    this.pausedAt = null
  }

  /** Moves to an adjacent cell. Returns false if it is not reachable in one step. */
  moveTo(cell: number, now: number): boolean {
    const dir = directionBetween(this.maze, this.player, cell)
    return dir !== null && this.move(dir, now)
  }

  /**
   * Shortest route from `from` to `target` (excluding `from`) for click-to-walk.
   * It may only cross cells the player has already stood in, so the mouse can
   * backtrack quickly but never walks an unseen stretch of maze for them. A
   * single step into a new cell is still a step, not a jump, so it is allowed.
   */
  routeTo(target: number, from: number = this.player): number[] | null {
    if (this.awaitingStart || this.busy || target < 0 || target >= this.visited.length) return null
    if (!this.visited[target]) {
      const dir = directionBetween(this.maze, from, target)
      return dir && this.canStep(from, dir) ? [target] : null
    }
    const walked = (cell: number): boolean => this.visited[cell] === 1
    // Walking back over your own footsteps still obeys one-way doors, so a
    // route home may be longer than the way out was — or may not exist.
    const path = this.features
      ? planRoute(this.maze, this.features, this.runState, from, target, {
          passable: walked,
          portals: false
        })
      : findPath(this.maze, from, target, { passable: walked })
    return path ? path.slice(1) : null
  }

  /**
   * Route for one step of a drag: the walked route where there is one, else a
   * short hop through new cells to cover the ones the pointer skipped.
   */
  traceTo(target: number, from: number): number[] | null {
    return this.routeTo(target, from) ?? this.shortHop(target, from)
  }

  /** Ends the run without solving it and reveals the whole maze and the route to the exit. */
  giveUp(now: number): boolean {
    if (this.awaitingStart || this.finished || this.busy) return false
    this.finishedAt = now
    this.gaveUp = true
    this.solution = this.routeToExit()
    this.hint = null
    this.explored.fill(1)
    this.visible.fill(1)
    this.changed()
    return true
  }

  useHint(now: number): boolean {
    if (this.awaitingStart || this.finished || this.busy || this.hintsRemaining <= 0) return false
    const path = this.routeToExit()
    if (!path) return false
    this.startClock(now)
    this.hintsUsed++
    this.hint = { path: path.slice(0, HINT_STEPS + 1), expiresAt: now + HINT_DURATION_MS }
    this.changed()
    return true
  }

  /** Milliseconds left on the start-of-run glimpse of the exit; 0 once it has passed. */
  exitPeekRemaining(now: number): number {
    if (this.exitPeekUntil === null) return 0
    const remaining = this.exitPeekUntil - now
    if (remaining > 0) return remaining
    this.exitPeekUntil = null
    this.changed()
    return 0
  }

  activeHint(now: number): ActiveHint | null {
    if (this.hint && now >= this.hint.expiresAt) {
      this.hint = null
      this.changed()
    }
    return this.hint
  }

  /**
   * The route the game is willing to show: from where the player stands to the
   * exit, spending the keys they hold and going through whatever the maze has
   * on it. Never a route they could not walk themselves.
   */
  private routeToExit(): number[] | null {
    return this.features
      ? planRoute(this.maze, this.features, this.runState, this.player, this.maze.end)
      : findPath(this.maze, this.player, this.maze.end)
  }

  /** Shortest route to a cell within `TRACE_GAP_STEPS` of `from`, walked or not. */
  private shortHop(target: number, from: number): number[] | null {
    if (this.features) {
      const route = planRoute(this.maze, this.features, this.runState, from, target, { portals: false })
      return route && route.length - 1 <= TRACE_GAP_STEPS ? route.slice(1) : null
    }
    const { dist, prev } = bfs(this.maze, from, { maxDepth: TRACE_GAP_STEPS })
    if (dist[target] === -1) return null
    const path: number[] = []
    for (let cell = target; cell !== from; cell = prev[cell]) path.push(cell)
    return path.reverse()
  }

  private startClock(now: number): void {
    if (this.startedAt === null) this.startedAt = now
  }

  private updateVision(): void {
    for (const cell of this.visibleCells) this.visible[cell] = 0
    const { dist } = bfs(this.maze, this.player, { maxDepth: this.visionRadius })
    this.visibleCells = []
    for (let cell = 0; cell < dist.length; cell++) {
      if (dist[cell] === -1) continue
      this.visible[cell] = 1
      this.explored[cell] = 1
      this.visibleCells.push(cell)
    }
  }

  private changed(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }
}
