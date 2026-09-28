import { describe, expect, it } from 'vitest'
import {
  canLeave,
  emptyFeatures,
  EMPTY_RUN_STATE,
  isEscapable,
  planRoute,
  portalExit,
  reachable,
  withoutKeys,
  MYSTERY_IS_GOOD,
  MYSTERY_OUTCOMES,
  type MazeFeatures,
  type MysteryOutcome
} from './arcade'
import { dailySettings } from './daily'
import { canMove, DIRECTIONS, DIRECTION_LIST, neighbor, openNeighbors, WALL_E, type Maze } from './maze'
import { generatePortalWorld, PORTAL_COUNTS, PORTAL_LAYOUTS, type PortalCount } from './portal'
import { BLIND_MS, BLIND_RADIUS, GameSession, MYSTERY_SPIN_MS } from './session'
import { describeModifiers, modifierKey, sanitizeSettings, DEFAULT_SETTINGS, FOG_LEVELS } from './settings'

const DAILY = PORTAL_LAYOUTS[2]

/** A week of Daily Portal seeds, so the invariants are checked against real layouts. */
const SEEDS = [
  'PORTAL-2026-09-28',
  'PORTAL-2026-09-29',
  'PORTAL-2026-09-30',
  'PORTAL-2026-10-01',
  'PORTAL-2026-10-02',
  'PORTAL-2026-10-03',
  'PORTAL-2026-10-04'
]

function portalSession(seed: string): GameSession {
  return new GameSession(dailySettings(DEFAULT_SETTINGS, seed), seed)
}

/** A custom Portal game of `count` mazes. */
function customSession(count: PortalCount, seed = 'K3F9Q2A'): GameSession {
  return new GameSession({ ...DEFAULT_SETTINGS, seedMode: 'random', portal: count }, seed)
}

/** Every Portal game the tests look at: the daily week, and a few custom games of each size. */
function everyWorld(): { name: string; session: GameSession }[] {
  return [
    ...SEEDS.map((seed) => ({ name: seed, session: portalSession(seed) })),
    ...PORTAL_COUNTS.flatMap((count) =>
      ['K3F9Q2A', '0ZX81PQ', 'M4AZE77'].map((seed) => ({ name: `${count} mazes ${seed}`, session: customSession(count, seed) }))
    )
  ]
}

/** A Portal maze and the features on it. */
function portalMaze(seed: string): { maze: Maze; features: MazeFeatures } {
  const session = portalSession(seed)
  return { maze: session.maze, features: session.features! }
}

/**
 * Walks a planned route move by move, the way a player would: a step to an
 * adjacent cell, or a step into the portal that comes out there. Throws if the
 * route asks for something the session refuses, which is the point of it.
 */
function walk(session: GameSession, route: number[]): void {
  const features = session.features!
  for (const target of route.slice(1)) {
    const from = session.player
    const dir = DIRECTION_LIST.find((d) => {
      const step = neighbor(session.maze, from, d)
      return step >= 0 && (step === target || portalExit(features, step) === target)
    })
    if (!dir) throw new Error(`No step from ${from} to ${target}`)
    if (!session.move(dir, 0)) throw new Error(`Refused to move ${dir} from ${from}`)
    if (session.player !== target) throw new Error(`Landed on ${session.player}, expected ${target}`)
  }
}

/** The mazes a route passes through, in order, one entry per visit. */
function mazesVisited(session: GameSession, route: number[]): number[] {
  const visits: number[] = []
  for (const cell of route) {
    const pane = session.paneOf(cell) + 1
    if (visits[visits.length - 1] !== pane) visits.push(pane)
  }
  return visits
}

/** How many walled-off pieces maze `pane` is in. */
function sectionsIn(session: GameSession, pane: number): number {
  const { maze } = session
  const layout = session.layout!
  const seen = new Uint8Array(maze.walls.length)
  let pieces = 0
  for (let y = 0; y < layout.paneHeight; y++) {
    for (let x = 0; x < layout.paneWidth; x++) {
      const cell = y * maze.width + pane * layout.paneWidth + x
      if (seen[cell]) continue
      pieces++
      const queue = [cell]
      seen[cell] = 1
      for (let i = 0; i < queue.length; i++) {
        for (const next of openNeighbors(maze, queue[i])) {
          if (seen[next]) continue
          seen[next] = 1
          queue.push(next)
        }
      }
    }
  }
  return pieces
}

/**
 * The first seed with a portal the player can walk up to on foot, with the route
 * that gets them there.
 */
function findPortalApproach(): { session: GameSession; entrance: number; exit: number; route: number[] } | null {
  for (const seed of SEEDS) {
    const session = portalSession(seed)
    session.begin(0)
    for (const [a, b] of session.features!.portalPairs) {
      for (const [entrance, exit] of [
        [a, b],
        [b, a]
      ]) {
        for (const dir of DIRECTION_LIST) {
          // An open passage, not just a grid neighbour: the player has to be able
          // to step across it.
          if (!canLeave(session.maze, session.features!, entrance, dir)) continue
          const approach = neighbor(session.maze, entrance, dir)
          const route = planRoute(session.maze, session.features!, session.runState, session.player, approach, {
            portals: false
          })
          if (route && canLeave(session.maze, session.features!, approach, DIRECTIONS[dir].opposite)) {
            return { session, entrance, exit, route }
          }
        }
      }
    }
  }
  return null
}

describe('portal worlds', () => {
  it('builds the same world for the same seed', () => {
    const session = portalSession(SEEDS[0])
    const again = generatePortalWorld(SEEDS[0], session.settings.algorithm, DAILY)
    expect([...again.maze.walls]).toEqual([...session.maze.walls])
    expect([...again.features.portals]).toEqual([...session.features!.portals])
    expect(again.features.keyCells).toEqual(session.features!.keyCells)
    expect(again.features.gateCells).toEqual(session.features!.gateCells)
    expect(again.features.boxCells).toEqual(session.features!.boxCells)
    expect([...again.features.oneWay]).toEqual([...session.features!.oneWay])
  })

  it('makes the Daily Portal two mazes, starting in the first and ending in the second', () => {
    for (const seed of SEEDS) {
      const session = portalSession(seed)
      expect(session.layout).toEqual(DAILY)
      expect(session.maze.width).toBe(DAILY.paneWidth * 2)
      expect(session.paneOf(session.maze.start), seed).toBe(0)
      expect(session.paneOf(session.maze.end), seed).toBe(1)
    }
  })

  it('never lets a passage run between two mazes', () => {
    for (const { name, session } of everyWorld()) {
      const layout = session.layout!
      for (let pane = 1; pane < layout.panes; pane++) {
        for (let y = 0; y < layout.paneHeight; y++) {
          const edge = y * session.maze.width + pane * layout.paneWidth - 1
          expect(session.maze.walls[edge] & WALL_E, `${name}: open between mazes`).not.toBe(0)
        }
      }
    }
  })

  it('cuts every maze into its sections', () => {
    for (const { name, session } of everyWorld()) {
      for (let pane = 0; pane < session.layout!.panes; pane++) {
        expect(sectionsIn(session, pane), `${name}, maze ${pane + 1}`).toBe(session.layout!.sections)
      }
    }
  })

  it('links only different mazes, and every portal both ways', () => {
    for (const { name, session } of everyWorld()) {
      const { portals, portalPairs } = session.features!
      for (const [a, b] of portalPairs) {
        expect(portals[a]).toBe(b)
        expect(portals[b]).toBe(a)
        expect(session.paneOf(a), `${name}: a portal within one maze`).not.toBe(session.paneOf(b))
      }
    }
  })

  it('makes portals the only way to the exit', () => {
    for (const { name, session } of everyWorld()) {
      const { maze } = session
      const walking = reachable(maze, emptyFeatures(maze), maze.start)
      expect(walking[maze.end], `${name}: the exit can be walked to`).toBe(0)
    }
  })

  it('bounces between the mazes on the way through, visiting every one', () => {
    for (const { name, session } of everyWorld()) {
      const route = planRoute(session.maze, session.features!, EMPTY_RUN_STATE, session.maze.start, session.maze.end)!
      const visits = mazesVisited(session, route)
      expect(new Set(visits).size, name).toBe(session.layout!.panes)
      // At least there and back and there again: never a straight hop to the exit.
      expect(visits.length, `${name}: ${visits.join(' > ')}`).toBeGreaterThanOrEqual(4)
    }
  })

  it('leaves no cell out of reach', () => {
    for (const { name, session } of everyWorld()) {
      const all = reachable(session.maze, session.features!, session.maze.start)
      expect(all.every((bit) => bit === 1), name).toBe(true)
    }
  })

  it('gives every Portal game its full complement of features', () => {
    for (const { name, session } of everyWorld()) {
      const features = session.features!
      const layout = session.layout!
      expect(features.gateCells, name).toHaveLength(layout.gates)
      expect(features.keyCells, name).toHaveLength(layout.gates)
      expect(features.boxCells, name).toHaveLength(layout.boxes)
      expect(features.oneWay.some((bits) => bits !== 0), name).toBe(true)
    }
  })

  it('never strands the player, wherever they wander', () => {
    for (const { name, session } of everyWorld()) {
      expect(isEscapable(session.maze, session.features!), name).toBe(true)
    }
  })

  it('keeps every key on the near side of every gate', () => {
    for (const seed of SEEDS) {
      const { maze, features } = portalMaze(seed)
      // With no keys in the maze at all, no gate can open — and every key must
      // still be reachable, or the player could be locked out of one.
      const sealed = withoutKeys(features)
      for (const key of features.keyCells) {
        const route = planRoute(maze, sealed, EMPTY_RUN_STATE, maze.start, key)
        expect(route, `key ${key} unreachable in ${seed}`).not.toBeNull()
      }
    }
  })

  it('puts gates where there is no way around them, not even through a portal', () => {
    for (const { name, session } of everyWorld()) {
      const { maze, features } = session
      expect(planRoute(maze, withoutKeys(features!), EMPTY_RUN_STATE, maze.start, maze.end), name).toBeNull()
    }
  })

  it('keeps portals out of the start and the exit', () => {
    for (const { name, session } of everyWorld()) {
      const { maze, features } = session
      expect(features!.portals[maze.start], name).toBe(-1)
      expect(features!.portals[maze.end], name).toBe(-1)
    }
  })
})

describe('portal routing', () => {
  it('plans a route the player can actually walk, for every game', () => {
    for (const { name, session } of everyWorld()) {
      session.begin(0)
      const route = planRoute(session.maze, session.features!, session.runState, session.player, session.maze.end)
      expect(route, `no route for ${name}`).not.toBeNull()
      walk(session, route!)
      expect(session.solved, `did not finish ${name}`).toBe(true)
      expect(session.moves).toBe(route!.length - 1)
    }
  })

  it('sends the player for a key before a locked gate', () => {
    const session = portalSession(SEEDS[0])
    session.begin(0)
    const route = planRoute(session.maze, session.features!, session.runState, session.player, session.maze.end)!
    const firstKey = route.findIndex((cell) => session.keyAt(cell))
    const firstGate = route.findIndex((cell) => session.gateAt(cell) === 'locked')
    expect(firstKey).toBeGreaterThanOrEqual(0)
    expect(firstGate).toBeGreaterThan(firstKey)
  })

  it('will not take a one-way door backwards', () => {
    for (const seed of SEEDS) {
      const session = portalSession(seed)
      const features = session.features!
      const cell = [...features.oneWay].findIndex((bits) => bits !== 0)
      expect(cell, `no one-way door in ${seed}`).toBeGreaterThanOrEqual(0)
      const back = DIRECTION_LIST.find((d) => (features.oneWay[cell] & DIRECTIONS[d].wall) !== 0)!
      // The passage is open — it is the door, not a wall, that stops the player.
      expect(canMove(session.maze, cell, back)).toBe(true)
      expect(canLeave(session.maze, features, cell, back)).toBe(false)
      session.begin(0)
      const backRoute = planRoute(session.maze, features, session.runState, cell, neighbor(session.maze, cell, back))
      expect(backRoute === null || backRoute.length > 2, `stepped back through the door in ${seed}`).toBe(true)
    }
  })
})

describe('custom portal games', () => {
  it('leaves a custom maze plain unless asked', () => {
    const session = new GameSession({ ...DEFAULT_SETTINGS, seedMode: 'random' }, 'K3F9Q2A')
    expect(session.features).toBeNull()
    expect(session.layout).toBeNull()
    expect(session.isPortal).toBe(false)
  })

  it('links as many mazes as asked for, each smaller as the count goes up', () => {
    let area = Infinity
    for (const count of PORTAL_COUNTS) {
      const session = customSession(count)
      expect(session.layout!.panes).toBe(count)
      expect(session.paneOf(session.maze.end)).toBe(count - 1)
      const each = session.layout!.paneWidth * session.layout!.paneHeight
      expect(each).toBeLessThan(area)
      area = each
    }
  })

  it('keeps each count on its own leaderboard', () => {
    const plain = { ...DEFAULT_SETTINGS, seedMode: 'random' as const }
    const keys = new Set([0, 2, 3, 4].map((portal) => modifierKey({ ...plain, portal: portal as 0 }, 'K3F9Q2A')))
    expect(keys.size).toBe(4)
    expect(describeModifiers({ ...plain, portal: 3 }, 'K3F9Q2A')).toContain('3 mazes of 28×18')
  })

  it('ignores the custom setting on the dailies', () => {
    const plainDaily = 'DAILY-2026-09-28'
    expect(new GameSession(dailySettings({ ...DEFAULT_SETTINGS, portal: 4 }, plainDaily), plainDaily).features).toBeNull()
    const seed = SEEDS[0]
    expect(new GameSession(dailySettings({ ...DEFAULT_SETTINGS, portal: 4 }, seed), seed).layout!.panes).toBe(2)
  })

  it('drops the retired Arcade dial from saved settings', () => {
    const saved = sanitizeSettings({ ...DEFAULT_SETTINGS, arcade: 'full', portal: undefined })
    expect(saved.portal).toBe(0)
    expect('arcade' in saved).toBe(false)
  })
})

describe('mystery boxes', () => {
  /** The first seed whose boxes include `outcome`, walked up to and opened. */
  function openBox(outcome: MysteryOutcome): { session: GameSession; cell: number } {
    for (const seed of SEEDS) {
      const session = portalSession(seed)
      const index = session.boxOutcomes.indexOf(outcome)
      if (index < 0) continue
      session.begin(0)
      const cell = session.features!.boxCells[index]
      walk(session, planRoute(session.maze, session.features!, session.runState, session.player, cell)!)
      return { session, cell }
    }
    throw new Error(`No seed had a ${outcome} box`)
  }

  it('only ever puts a box at a dead end', () => {
    for (const seed of SEEDS) {
      const { maze, features } = portalMaze(seed)
      expect(features.boxCells.length, seed).toBeGreaterThan(0)
      for (const cell of features.boxCells) {
        expect(openNeighbors(maze, cell), `box ${cell} in ${seed} is not a dead end`).toHaveLength(1)
        expect(cell).not.toBe(maze.start)
        expect(cell).not.toBe(maze.end)
      }
    }
  })

  it('deals outcomes from a bag, so no maze is all punishment', () => {
    for (const seed of SEEDS) {
      const outcomes = portalSession(seed).boxOutcomes
      // Dealt from shuffled bags of all four outcomes, so the counts can never
      // be further apart than one whole bag's worth: with five boxes, one
      // outcome comes up twice and the other three once each.
      const times = (outcome: MysteryOutcome): number => outcomes.filter((o) => o === outcome).length
      for (const outcome of MYSTERY_OUTCOMES) {
        expect(times(outcome), `${outcome} in ${seed}`).toBeGreaterThanOrEqual(Math.floor(outcomes.length / 4))
        expect(times(outcome), `${outcome} in ${seed}`).toBeLessThanOrEqual(Math.ceil(outcomes.length / 4))
      }
      expect(outcomes.some((o) => MYSTERY_IS_GOOD[o]), `nothing good in ${seed}`).toBe(true)
    }
  })

  it('deals fresh outcomes each run of the same seed, in the same places', () => {
    const seed = SEEDS[0]
    const runs = Array.from({ length: 20 }, () => portalSession(seed))
    for (const run of runs) expect(run.features!.boxCells).toEqual(runs[0].features!.boxCells)
    const deals = new Set(runs.map((run) => run.boxOutcomes.join()))
    expect(deals.size, 'twenty runs all dealt the same boxes').toBeGreaterThan(1)
  })

  it('never routes the player through a box', () => {
    // Boxes sit at dead ends and a shortest route has no reason to enter one,
    // so a hint or a give-up route never walks into a gamble.
    for (const seed of SEEDS) {
      const session = portalSession(seed)
      session.begin(0)
      const route = planRoute(session.maze, session.features!, session.runState, session.player, session.maze.end)!
      for (const cell of route) expect(session.boxAt(cell), `route crosses a box in ${seed}`).toBe(false)
    }
  })

  it('freezes the run while the reel spins, and stops the clock', () => {
    const { session, cell } = openBox('break')
    expect(session.mystery?.cell).toBe(cell)
    expect(session.mystery?.outcome).toBe('break')
    expect(session.busy).toBe(true)
    expect(session.boxAt(cell), 'the box is spent as it opens').toBe(false)

    // Nothing the player does lands while it spins.
    expect(DIRECTION_LIST.some((d) => session.move(d, 500))).toBe(false)
    expect(session.routeTo(session.maze.end, session.player)).toBeNull()
    expect(session.giveUp(500)).toBe(false)
    expect(session.armBreak(true)).toBe(false)
    expect(session.elapsed(1500), 'the clock is stopped').toBe(0)

    expect(session.mysteryRemaining(1000)).toBeGreaterThan(0)
    expect(session.mysteryRemaining(MYSTERY_SPIN_MS)).toBe(0)
    expect(session.busy).toBe(false)
    expect(session.mystery).toBeNull()
    // The two seconds it spun for are not counted against the player.
    expect(session.elapsed(MYSTERY_SPIN_MS + 1000)).toBe(1000)
  })

  it('hands over a wall-break charge', () => {
    const { session } = openBox('break')
    session.mysteryRemaining(MYSTERY_SPIN_MS)
    expect(session.breaksLeft).toBe(1)
    expect(session.armBreak(true)).toBe(true)
  })

  it('hands over a wall jump, which hops a wall and leaves it standing', () => {
    const { session } = openBox('jump')
    session.mysteryRemaining(MYSTERY_SPIN_MS)
    expect(session.jumpsLeft).toBe(1)

    const walled = DIRECTION_LIST.find(
      (d) => neighbor(session.maze, session.player, d) >= 0 && !canMove(session.maze, session.player, d)
    )!
    const from = session.player
    const over = neighbor(session.maze, from, walled)
    expect(session.move(walled, MYSTERY_SPIN_MS)).toBe(false)

    expect(session.armJump(true)).toBe(true)
    expect(session.move(walled, MYSTERY_SPIN_MS)).toBe(true)
    expect(session.player).toBe(over)
    expect(session.jumpsLeft).toBe(0)
    expect(session.jumpArmed).toBe(false)
    // The wall is still there, and no breadcrumb pretends otherwise.
    expect(canMove(session.maze, from, walled), 'the wall is still standing').toBe(false)
    expect(session.trail[from] & DIRECTIONS[walled].wall).toBe(0)
  })

  it('arms a break and a jump one at a time', () => {
    const { session } = openBox('jump')
    session.mysteryRemaining(MYSTERY_SPIN_MS)
    session.breaksLeft = 1
    expect(session.armJump(true)).toBe(true)
    expect(session.armBreak(true)).toBe(true)
    expect(session.jumpArmed, 'arming one puts the other away').toBe(false)
  })

  it('sends the player back to the start, trail and all', () => {
    const { session, cell } = openBox('restart')
    expect(session.player).toBe(cell)
    const moves = session.moves
    session.mysteryRemaining(MYSTERY_SPIN_MS)
    expect(session.player).toBe(session.maze.start)
    // Nothing else is taken away: the walk back is the whole penalty.
    expect(session.moves).toBe(moves)
    expect(session.visited[cell]).toBe(1)
    expect(session.trail.some((bits) => bits !== 0)).toBe(true)
  })

  it('puts the lights out, then puts them back', () => {
    const { session } = openBox('blind')
    expect(session.fogEnabled, 'an Arcade maze has no fog of its own').toBe(false)
    session.mysteryRemaining(MYSTERY_SPIN_MS)

    expect(session.blindUntil).not.toBeNull()
    expect(session.visionRadius).toBe(BLIND_RADIUS)
    expect(session.visionRadius, 'as tight as the densest fog').toBe(FOG_LEVELS.dense.radius)
    expect(session.fogEnabled).toBe(true)
    // Nothing walked earlier is remembered while the lights are out.
    const seen = session.explored.reduce((n, bit) => n + bit, 0)
    expect(seen, 'the maze goes dark').toBeLessThan(session.explored.length / 4)

    expect(session.blindRemaining(MYSTERY_SPIN_MS + 1000)).toBeGreaterThan(0)
    expect(session.blindRemaining(MYSTERY_SPIN_MS + BLIND_MS)).toBe(0)
    expect(session.fogEnabled).toBe(false)
    expect(session.explored.every((bit) => bit === 1), 'the maze comes back').toBe(true)
  })
})

describe('portal gameplay', () => {
  it('takes the player to another maze through a portal, as a single move', () => {
    // A portal sitting in a corridor cannot be walked *through* — stepping on it
    // always teleports — so the approach is planned to a neighbour of it.
    const approach = findPortalApproach()
    expect(approach, 'no seed had a portal to walk up to').not.toBeNull()
    const { session, entrance, exit, route } = approach!

    walk(session, route)
    const before = session.moves
    const onto = DIRECTION_LIST.find((d) => neighbor(session.maze, session.player, d) === entrance)!
    expect(session.move(onto, 0)).toBe(true)
    expect(session.player).toBe(exit)
    expect(session.paneOf(exit)).not.toBe(session.paneOf(entrance))
    expect(session.moves).toBe(before + 1)

    // Standing on the far portal does not send the player straight back.
    const away = DIRECTION_LIST.find((d) => session.move(d, 0))
    expect(away).toBeDefined()
    expect(session.player).not.toBe(entrance)
  })

  it('will not break or jump the outer wall of a maze into the next one', () => {
    const session = portalSession(SEEDS[0])
    session.begin(0)
    const layout = session.layout!
    // The last column of maze 1, whose east wall is maze 2's west wall.
    session.player = layout.paneWidth - 1
    session.breaksLeft = 1
    expect(session.armBreak(true)).toBe(true)
    expect(session.move('right', 0)).toBe(false)
    expect(canMove(session.maze, session.player, 'right')).toBe(false)
    expect(session.breaksLeft, 'the charge is not spent').toBe(1)

    session.jumpsLeft = 1
    expect(session.armJump(true)).toBe(true)
    expect(session.move('right', 0)).toBe(false)
    expect(session.paneOf(session.player)).toBe(0)
  })

  it('spends a key on a gate and keeps it open afterwards', () => {
    const session = portalSession(SEEDS[0])
    session.begin(0)
    const gate = session.features!.gateCells[0]
    expect(session.gateAt(gate)).toBe('locked')

    const route = planRoute(session.maze, session.features!, session.runState, session.player, gate)!
    walk(session, route)
    expect(session.player).toBe(gate)
    expect(session.gateAt(gate)).toBe('open')
  })

  it('will not open a gate without a key', () => {
    const session = portalSession(SEEDS[0])
    session.begin(0)
    const gate = session.features!.gateCells[0]
    const approach = planRoute(session.maze, session.features!, session.runState, session.player, gate)!
    // Walk to the cell before the gate, then drop the keys picked up on the way.
    walk(session, approach.slice(0, -1))
    session.keysHeld = 0
    const dir = DIRECTION_LIST.find((d) => neighbor(session.maze, session.player, d) === gate)!
    expect(session.move(dir, 0)).toBe(false)
    expect(session.gateAt(gate)).toBe('locked')
  })

  it('starts with no wall-break charges, and will not arm one', () => {
    const session = portalSession(SEEDS[0])
    session.begin(0)
    expect(session.breaksLeft).toBe(0)
    expect(session.boxesLeft).toBe(DAILY.boxes)
    expect(session.armBreak(true)).toBe(false)
    expect(session.breakArmed).toBe(false)
  })

  it('leaves a plain daily maze with no features at all', () => {
    const seed = 'DAILY-2026-09-28'
    const session = new GameSession(dailySettings(DEFAULT_SETTINGS, seed), seed)
    expect(session.features).toBeNull()
    expect(session.isPortal).toBe(false)
    expect(session.paneOf(session.maze.end)).toBe(0)
    expect(session.breaksLeft).toBe(0)
    expect(session.boxesLeft).toBe(0)
  })
})
