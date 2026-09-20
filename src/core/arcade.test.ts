import { describe, expect, it } from 'vitest'
import {
  canLeave,
  EMPTY_RUN_STATE,
  generateFeatures,
  isEscapable,
  optimalFeatureMoves,
  planRoute,
  arcadeSpecFor,
  portalExit,
  withoutKeys,
  MYSTERY_IS_GOOD,
  MYSTERY_OUTCOMES,
  type MazeFeatures,
  type MysteryOutcome
} from './arcade'
import { arcadeSpec, dailySettings } from './daily'
import { canMove, DIRECTIONS, DIRECTION_LIST, neighbor, openNeighbors, type Maze } from './maze'
import { BLIND_MS, BLIND_RADIUS, GameSession, MYSTERY_SPIN_MS } from './session'
import { describeModifiers, modifierKey, DEFAULT_SETTINGS, FOG_LEVELS } from './settings'
import { findPath } from './solver'

const SPEC = arcadeSpec('ARCADE-2026-09-20')!

/** A week of Arcade seeds, so the invariants are checked against real layouts. */
const SEEDS = [
  'ARCADE-2026-09-20',
  'ARCADE-2026-09-21',
  'ARCADE-2026-09-22',
  'ARCADE-2026-09-23',
  'ARCADE-2026-09-24',
  'ARCADE-2026-09-25',
  'ARCADE-2026-09-26'
]

function arcadeSession(seed: string): GameSession {
  return new GameSession(dailySettings(DEFAULT_SETTINGS, seed), seed)
}

/** An Arcade maze and the features on it, which every Arcade seed has. */
function arcadeMaze(seed: string): { maze: Maze; features: MazeFeatures } {
  const session = arcadeSession(seed)
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

/**
 * The first seed with a portal the player can walk up to on foot, with the route
 * that gets them there.
 */
function findPortalApproach(): { session: GameSession; entrance: number; exit: number; route: number[] } | null {
  for (const seed of SEEDS) {
    const session = arcadeSession(seed)
    session.begin(0)
    for (const [entrance, exit] of session.features!.portalPairs) {
      for (const dir of DIRECTION_LIST) {
        // An open passage, not just a grid neighbour: the player has to be able
        // to step across it.
        if (!canLeave(session.maze, session.features!, entrance, dir)) continue
        const approach = neighbor(session.maze, entrance, dir)
        if (approach < 0) continue
        const route = planRoute(session.maze, session.features!, session.runState, session.player, approach, {
          portals: false
        })
        // The last step has to be onto the portal, so the approach must be
        // somewhere the player can stand and then step across.
        if (route && DIRECTION_LIST.some((d) => canLeave(session.maze, session.features!, approach, d) && neighbor(session.maze, approach, d) === entrance)) {
          return { session, entrance, exit, route }
        }
      }
    }
  }
  return null
}

describe('arcade features', () => {
  it('places the same features for the same seed', () => {
    const session = arcadeSession(SEEDS[0])
    const again = generateFeatures(session.maze, `${SEEDS[0]}:arcade`, SPEC)
    expect([...again.portals]).toEqual([...session.features!.portals])
    expect(again.keyCells).toEqual(session.features!.keyCells)
    expect(again.gateCells).toEqual(session.features!.gateCells)
    expect([...again.oneWay]).toEqual([...session.features!.oneWay])
  })

  it('gives every Arcade maze its full complement of features', () => {
    for (const seed of SEEDS) {
      const features = arcadeSession(seed).features!
      expect(features.portalPairs).toHaveLength(SPEC.portalPairs)
      expect(features.gateCells).toHaveLength(SPEC.gates)
      expect(features.keyCells).toHaveLength(SPEC.gates)
      expect(features.boxCells).toHaveLength(SPEC.boxes)
      expect(features.oneWay.some((bits) => bits !== 0)).toBe(true)
    }
  })

  it('never strands the player, wherever they wander', () => {
    for (const seed of SEEDS) {
      const session = arcadeSession(seed)
      expect(isEscapable(session.maze, session.features!)).toBe(true)
    }
  })

  it('keeps every key on the near side of every gate', () => {
    for (const seed of SEEDS) {
      const { maze, features } = arcadeMaze(seed)
      // With no keys in the maze at all, no gate can open — and every key must
      // still be reachable, or the player could be locked out of one.
      const sealed = withoutKeys(features)
      for (const key of features.keyCells) {
        const route = planRoute(maze, sealed, EMPTY_RUN_STATE, maze.start, key)
        expect(route, `key ${key} unreachable in ${seed}`).not.toBeNull()
      }
    }
  })

  it('puts gates on the one route to the exit, with no way around them', () => {
    for (const seed of SEEDS) {
      const { maze, features } = arcadeMaze(seed)
      const main = findPath(maze, maze.start, maze.end)!
      for (const gate of features.gateCells) expect(main).toContain(gate)
      // Not even a portal may jump the player past a gate: that would make its
      // key pointless and the run a lottery on which shortcut you found.
      expect(planRoute(maze, withoutKeys(features), EMPTY_RUN_STATE, maze.start, maze.end)).toBeNull()
    }
  })

  it('does not let portals turn the maze into a sprint', () => {
    for (const seed of SEEDS) {
      const { maze, features } = arcadeMaze(seed)
      const plain = findPath(maze, maze.start, maze.end)!.length
      expect(optimalFeatureMoves(maze, features)).toBeGreaterThanOrEqual(plain * 0.5)
    }
  })
})

describe('arcade routing', () => {
  it('plans a route the player can actually walk, for every seed', () => {
    for (const seed of SEEDS) {
      const session = arcadeSession(seed)
      session.begin(0)
      const route = planRoute(session.maze, session.features!, session.runState, session.player, session.maze.end)
      expect(route, `no route for ${seed}`).not.toBeNull()
      walk(session, route!)
      expect(session.solved, `did not finish ${seed}`).toBe(true)
      expect(session.moves).toBe(route!.length - 1)
    }
  })

  it('sends the player for a key before a locked gate', () => {
    const session = arcadeSession(SEEDS[0])
    session.begin(0)
    const route = planRoute(session.maze, session.features!, session.runState, session.player, session.maze.end)!
    const firstKey = route.findIndex((cell) => session.keyAt(cell))
    const firstGate = route.findIndex((cell) => session.gateAt(cell) === 'locked')
    expect(firstKey).toBeGreaterThanOrEqual(0)
    expect(firstGate).toBeGreaterThan(firstKey)
  })

  it('will not take a one-way door backwards', () => {
    for (const seed of SEEDS) {
      const session = arcadeSession(seed)
      const features = session.features!
      const cell = [...features.oneWay].findIndex((bits) => bits !== 0)
      expect(cell, `no one-way door in ${seed}`).toBeGreaterThanOrEqual(0)
      const back = DIRECTION_LIST.find((d) => (features.oneWay[cell] & DIRECTIONS[d].wall) !== 0)!
      // The passage is open — it is the door, not a wall, that stops the player.
      expect(canMove(session.maze, cell, back)).toBe(true)
      expect(canLeave(session.maze, features, cell, back)).toBe(false)
      session.begin(0)
      // Getting back there may still be possible the long way round, or through
      // a portal — but never by stepping straight back through the door.
      const backRoute = planRoute(session.maze, features, session.runState, cell, neighbor(session.maze, cell, back))
      expect(backRoute === null || backRoute.length > 2, `stepped back through the door in ${seed}`).toBe(true)
    }
  })
})

describe('custom arcade mazes', () => {
  const custom = (arcade: 'off' | 'light' | 'full', sizePreset: 'small' | 'medium' | 'large' | 'huge') =>
    new GameSession({ ...DEFAULT_SETTINGS, seedMode: 'random' as const, sizePreset, arcade }, 'K3F9Q2A')

  it('leaves a custom maze plain unless asked', () => {
    expect(custom('off', 'medium').features).toBeNull()
  })

  it('scatters features on a custom maze at either level', () => {
    for (const level of ['light', 'full'] as const) {
      const session = custom(level, 'medium')
      const features = session.features!
      expect(features.portalPairs.length, level).toBeGreaterThan(0)
      expect(features.gateCells.length, level).toBeGreaterThan(0)
      expect(features.keyCells).toHaveLength(features.gateCells.length)
      expect(features.boxCells.length, level).toBeGreaterThan(0)
      expect(isEscapable(session.maze, features), level).toBe(true)
    }
  })

  it('holds every invariant at every preset size', () => {
    for (const sizePreset of ['small', 'medium', 'large', 'huge'] as const) {
      const session = custom('full', sizePreset)
      const features = session.features!
      expect(isEscapable(session.maze, features), sizePreset).toBe(true)
      expect(
        planRoute(session.maze, withoutKeys(features), EMPTY_RUN_STATE, session.maze.start, session.maze.end),
        `gates bypassable on ${sizePreset}`
      ).toBeNull()
      // And the route it would show is one that can actually be walked.
      const route = planRoute(session.maze, features, session.runState, session.player, session.maze.end)!
      walk(session, route)
      expect(session.solved, sizePreset).toBe(true)
    }
  })

  it('scales the feature count with the maze, not with nothing', () => {
    const small = arcadeSpecFor('full', 15, 10)!
    const huge = arcadeSpecFor('full', 90, 56)!
    expect(huge.portalPairs).toBeGreaterThan(small.portalPairs)
    expect(huge.oneWays).toBeGreaterThan(small.oneWays)
    expect(huge.boxes).toBeGreaterThan(small.boxes)
    // Gates cost the route planner a dimension each, so they stay put.
    expect(huge.gates).toBe(small.gates)
    expect(arcadeSpecFor('off', 30, 20)).toBeNull()
  })

  it('keeps a custom arcade run out of the plain maze leaderboard', () => {
    const plain = { ...DEFAULT_SETTINGS, seedMode: 'random' as const }
    expect(modifierKey({ ...plain, arcade: 'full' }, 'K3F9Q2A')).not.toBe(modifierKey(plain, 'K3F9Q2A'))
    expect(modifierKey({ ...plain, arcade: 'full' }, 'K3F9Q2A')).not.toBe(
      modifierKey({ ...plain, arcade: 'light' }, 'K3F9Q2A')
    )
    expect(describeModifiers({ ...plain, arcade: 'full' }, 'K3F9Q2A')).toContain('Full arcade')
  })

  it('ignores the custom dial on a daily maze', () => {
    const seed = 'DAILY-2026-09-20'
    const session = new GameSession(dailySettings({ ...DEFAULT_SETTINGS, arcade: 'full' }, seed), seed)
    expect(session.features).toBeNull()
  })
})

describe('mystery boxes', () => {
  /** The first seed whose boxes include `outcome`, walked up to and opened. */
  function openBox(outcome: MysteryOutcome): { session: GameSession; cell: number } {
    for (const seed of SEEDS) {
      const session = arcadeSession(seed)
      const index = session.features!.boxOutcomes.indexOf(outcome)
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
      const { maze, features } = arcadeMaze(seed)
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
      const outcomes = arcadeMaze(seed).features.boxOutcomes
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

  it('never routes the player through a box', () => {
    // Boxes sit at dead ends and a shortest route has no reason to enter one,
    // so a hint or a give-up route never walks into a gamble.
    for (const seed of SEEDS) {
      const session = arcadeSession(seed)
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

describe('arcade gameplay', () => {
  it('teleports through a portal as a single move, without bouncing back', () => {
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
    expect(session.moves).toBe(before + 1)

    // Standing on the far portal does not send the player straight back.
    const away = DIRECTION_LIST.find((d) => session.move(d, 0))
    expect(away).toBeDefined()
    expect(session.player).not.toBe(entrance)
  })

  it('spends a key on a gate and keeps it open afterwards', () => {
    const session = arcadeSession(SEEDS[0])
    session.begin(0)
    const gate = session.features!.gateCells[0]
    expect(session.gateAt(gate)).toBe('locked')

    const route = planRoute(session.maze, session.features!, session.runState, session.player, gate)!
    walk(session, route)
    expect(session.player).toBe(gate)
    expect(session.gateAt(gate)).toBe('open')
    expect(session.keysHeld).toBe(0)
  })

  it('will not open a gate without a key', () => {
    const session = arcadeSession(SEEDS[0])
    session.begin(0)
    const gate = session.features!.gateCells[0]
    const approach = planRoute(session.maze, session.features!, session.runState, session.player, gate)!
    // Walk to the cell before the gate, then drop the key that was picked up.
    walk(session, approach.slice(0, -1))
    session.keysHeld = 0
    const dir = DIRECTION_LIST.find((d) => neighbor(session.maze, session.player, d) === gate)!
    expect(session.move(dir, 0)).toBe(false)
    expect(session.gateAt(gate)).toBe('locked')
  })

  it('starts with no wall-break charges, and will not arm one', () => {
    const session = arcadeSession(SEEDS[0])
    session.begin(0)
    expect(session.breaksLeft).toBe(0)
    expect(session.boxesLeft).toBe(SPEC.boxes)
    expect(session.armBreak(true)).toBe(false)
    expect(session.breakArmed).toBe(false)

    // With nothing armed, a wall is still a wall.
    const walled = DIRECTION_LIST.find((d) => {
      const step = neighbor(session.maze, session.player, d)
      return step >= 0 && !session.move(d, 0)
    })
    expect(walled).toBeDefined()
    expect(session.move(walled!, 0)).toBe(false)
  })

  it('never needs a charge to finish the maze', () => {
    // The route planner knows nothing about charges, so a route it finds is one
    // walked without breaking anything.
    for (const seed of SEEDS) {
      const session = arcadeSession(seed)
      session.begin(0)
      walk(session, planRoute(session.maze, session.features!, session.runState, session.player, session.maze.end)!)
      expect(session.solved, seed).toBe(true)
    }
  })

  it('leaves a plain daily maze with no features at all', () => {
    const seed = 'DAILY-2026-09-20'
    const session = new GameSession(dailySettings(DEFAULT_SETTINGS, seed), seed)
    expect(session.features).toBeNull()
    expect(session.isArcade).toBe(false)
    expect(session.breaksLeft).toBe(0)
    expect(session.boxesLeft).toBe(0)
  })
})
