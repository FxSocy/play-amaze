import { describe, expect, it } from 'vitest'
import { canMove, DIRECTION_LIST, WALL_E, WALL_N, WALL_S, WALL_W, directionBetween, neighbor, type Direction } from './maze'
import { EXIT_PEEK_MS, GameSession, HINT_DURATION_MS, TRACE_GAP_STEPS } from './session'
import { DEFAULT_SETTINGS, type GameSettings } from './settings'
import { findPath } from './solver'

const settings = (patch: Partial<GameSettings> = {}): GameSettings => ({
  ...DEFAULT_SETTINGS,
  seedMode: 'random',
  sizePreset: 'small',
  ...patch
})

function blockedDirection(session: GameSession): Direction {
  const dir = DIRECTION_LIST.find((d) => !canMove(session.maze, session.player, d))
  if (!dir) throw new Error('expected a wall next to the player')
  return dir
}

describe('GameSession', () => {
  it('starts at the maze start with a zeroed clock', () => {
    const s = new GameSession(settings(), 'abc')
    expect(s.player).toBe(s.maze.start)
    expect(s.moves).toBe(0)
    expect(s.elapsed(5000)).toBe(0)
  })

  it('does not move or count moves through walls', () => {
    const s = new GameSession(settings(), 'abc')
    expect(s.move(blockedDirection(s), 100)).toBe(false)
    expect(s.moves).toBe(0)
    expect(s.startedAt).toBeNull()
  })

  it('walks the solution, tracking moves, time and completion', () => {
    const s = new GameSession(settings(), 'abc')
    const path = findPath(s.maze, s.maze.start, s.maze.end)!
    let now = 1000
    for (const cell of path.slice(1)) {
      expect(s.moveTo(cell, now)).toBe(true)
      now += 100
    }
    expect(s.finished).toBe(true)
    expect(s.moves).toBe(s.optimalMoves)
    expect(s.elapsed(99999)).toBe(now - 100 - 1000)
    expect(s.moveTo(path[path.length - 2], now)).toBe(false)
  })

  it('notifies subscribers on change', () => {
    const s = new GameSession(settings(), 'abc')
    let calls = 0
    const unsubscribe = s.subscribe(() => calls++)
    s.moveTo(findPath(s.maze, s.player, s.maze.end)![1], 0)
    unsubscribe()
    s.moveTo(findPath(s.maze, s.player, s.maze.end)![1], 0)
    expect(calls).toBe(1)
  })

  it('records walked passages on both sides for breadcrumbs', () => {
    const s = new GameSession(settings(), 'abc')
    expect(s.trail.every((v) => v === 0)).toBe(true)
    const from = s.player
    const to = findPath(s.maze, from, s.maze.end)![1]
    const dir = directionBetween(s.maze, from, to)!
    s.moveTo(to, 0)
    const bits = { up: WALL_N, right: WALL_E, down: WALL_S, left: WALL_W }
    const opposite = { up: WALL_S, right: WALL_W, down: WALL_N, left: WALL_E }
    expect(s.trail[from]).toBe(bits[dir])
    expect(s.trail[to]).toBe(opposite[dir])
  })

  describe('start gate', () => {
    it('does not apply to non-daily mazes', () => {
      const s = new GameSession(settings(), 'abc')
      expect(s.awaitingStart).toBe(false)
      expect(s.begin(0)).toBe(false)
    })

    it('locks a daily maze until begin(), which starts the clock', () => {
      const s = new GameSession(settings({ seedMode: 'daily' }), 'abc')
      const next = findPath(s.maze, s.player, s.maze.end)![1]
      expect(s.awaitingStart).toBe(true)
      expect(s.moveTo(next, 100)).toBe(false)
      expect(s.routeTo(next)).toBeNull()
      expect(s.giveUp(100)).toBe(false)
      expect(s.elapsed(100)).toBe(0)

      expect(s.begin(500)).toBe(true)
      expect(s.begin(600)).toBe(false)
      expect(s.startedAt).toBe(500)
      expect(s.elapsed(1500)).toBe(1000)
      expect(s.moveTo(next, 2000)).toBe(true)
      expect(s.startedAt).toBe(500)
    })
  })

  describe('exit peek', () => {
    it('shows the exit for the first seconds of a Doozie run, then stops', () => {
      const s = new GameSession(settings({ seedMode: 'daily', fog: 'light' }), 'DOOZIE-2026-09-17')
      expect(s.exitPeekRemaining(0)).toBe(0)

      s.begin(500)
      expect(s.exitPeekRemaining(500)).toBe(EXIT_PEEK_MS)
      expect(s.exitPeekRemaining(500 + EXIT_PEEK_MS - 1)).toBe(1)
      expect(s.exitPeekRemaining(500 + EXIT_PEEK_MS)).toBe(0)
      expect(s.exitPeekUntil).toBeNull()
    })

    it('does not apply to the standard daily maze', () => {
      const s = new GameSession(settings({ seedMode: 'daily' }), 'DAILY-2026-09-17')
      s.begin(500)
      expect(s.exitPeekRemaining(500)).toBe(0)
    })
  })

  describe('giving up', () => {
    it('ends the run, reveals the maze and the route from the player to the exit', () => {
      const s = new GameSession(settings({ fog: 'dense', hints: 3 }), 'abc')
      const next = findPath(s.maze, s.player, s.maze.end)![1]
      s.moveTo(next, 1000)
      s.useHint(1500)
      expect(s.giveUp(3000)).toBe(true)
      expect(s.finished).toBe(true)
      expect(s.gaveUp).toBe(true)
      expect(s.solved).toBe(false)
      expect(s.elapsed(99999)).toBe(2000)
      expect(s.hint).toBeNull()
      expect(s.explored.every((v) => v === 1)).toBe(true)
      expect(s.solution).toEqual(findPath(s.maze, next, s.maze.end))
    })

    it('blocks further moves and cannot happen twice or after solving', () => {
      const s = new GameSession(settings(), 'abc')
      s.giveUp(0)
      expect(s.giveUp(1)).toBe(false)
      expect(DIRECTION_LIST.some((d) => s.move(d, 2))).toBe(false)
      expect(s.useHint(3)).toBe(false)

      const solved = new GameSession(settings(), 'abc')
      for (const cell of findPath(solved.maze, solved.player, solved.maze.end)!.slice(1)) solved.moveTo(cell, 0)
      expect(solved.giveUp(1)).toBe(false)
      expect(solved.solved).toBe(true)
    })
  })

  describe('hints', () => {
    it('are unavailable when the modifier is off', () => {
      const s = new GameSession(settings({ hints: 0 }), 'abc')
      expect(s.useHint(0)).toBe(false)
    })

    it('are limited, start the clock and expire', () => {
      const s = new GameSession(settings({ hints: 1 }), 'abc')
      expect(s.useHint(500)).toBe(true)
      expect(s.startedAt).toBe(500)
      expect(s.hintsRemaining).toBe(0)
      expect(s.activeHint(600)?.path[0]).toBe(s.player)
      expect(s.activeHint(500 + HINT_DURATION_MS)).toBeNull()
      expect(s.useHint(10000)).toBe(false)
    })
  })

  describe('fog of war', () => {
    it('reveals everything when off', () => {
      const s = new GameSession(settings({ fog: 'off' }), 'abc')
      expect(s.explored.every((v) => v === 1)).toBe(true)
    })

    it('only reveals cells near the player and remembers explored cells', () => {
      const s = new GameSession(settings({ fog: 'dense' }), 'abc')
      const initiallyExplored = s.explored.reduce((a, b) => a + b, 0)
      expect(initiallyExplored).toBeGreaterThan(0)
      expect(initiallyExplored).toBeLessThan(s.explored.length)
      expect(s.explored[s.maze.end]).toBe(0)

      const path = findPath(s.maze, s.player, s.maze.end)!
      for (const cell of path.slice(1, 6)) s.moveTo(cell, 0)
      const explored = s.explored.reduce((a, b) => a + b, 0)
      expect(explored).toBeGreaterThanOrEqual(initiallyExplored)
      expect(s.explored[s.maze.start]).toBe(1)
      expect(s.visible[s.player]).toBe(1)
    })

    it('refuses mouse routes into unexplored cells', () => {
      const s = new GameSession(settings({ fog: 'dense' }), 'abc')
      expect(s.routeTo(s.maze.end)).toBeNull()
      const nearby = s.explored.findIndex((v, cell) => v === 1 && cell !== s.player)
      expect(s.routeTo(nearby)).toBeNull()
    })
  })

  describe('mouse routes', () => {
    it('will not walk to a cell the player has never stood in, fog or not', () => {
      const s = new GameSession(settings({ fog: 'off' }), 'abc')
      expect(s.explored.every((v) => v === 1)).toBe(true)
      expect(s.routeTo(s.maze.end)).toBeNull()
    })

    it('backtracks over walked cells, however far', () => {
      const s = new GameSession(settings({ fog: 'off' }), 'abc')
      const path = findPath(s.maze, s.maze.start, s.maze.end)!
      const walked = path.slice(1, 8)
      for (const cell of walked) s.moveTo(cell, 0)

      const route = s.routeTo(s.maze.start)!
      expect(route[route.length - 1]).toBe(s.maze.start)
      expect(route.every((cell) => s.visited[cell] === 1)).toBe(true)
      // The cell after the ones walked so far is still off limits.
      expect(s.routeTo(path[9])).toBeNull()
    })

    it('allows a single step into a new cell, but not through a wall', () => {
      const s = new GameSession(settings({ fog: 'off' }), 'abc')
      const next = findPath(s.maze, s.player, s.maze.end)![1]
      expect(s.routeTo(next)).toEqual([next])
      const blocked = neighbor(s.maze, s.player, blockedDirection(s))
      if (blocked >= 0) expect(s.routeTo(blocked)).toBeNull()
    })

    it('fills short gaps when a drag skips cells, but no more', () => {
      const s = new GameSession(settings({ fog: 'off' }), 'abc')
      const path = findPath(s.maze, s.maze.start, s.maze.end)!
      const gap = path[TRACE_GAP_STEPS]
      expect(s.traceTo(gap, s.player)).toEqual(path.slice(1, TRACE_GAP_STEPS + 1))
      expect(s.traceTo(path[TRACE_GAP_STEPS + 1], s.player)).toBeNull()
    })
  })
})
