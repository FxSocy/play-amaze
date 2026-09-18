import { dailyKind } from './daily'
import { generateMaze } from './generators'
import { canMove, cellCount, directionBetween, DIRECTIONS, neighbor, type Direction, type Maze } from './maze'
import { FOG_LEVELS, resolveSize, type GameSettings } from './settings'
import { bfs, findPath } from './solver'

/** How many upcoming solution steps a hint reveals. */
export const HINT_STEPS = 12
export const HINT_DURATION_MS = 4000

/**
 * How long the Daily Doozie shows its exit when the run starts. Its fog hides
 * the exit entirely, so a glimpse gives the player a direction to head in.
 */
export const EXIT_PEEK_MS = 3000

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

  player: number
  moves = 0
  hintsUsed = 0
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
  private visibleCells: number[] = []
  private readonly listeners = new Set<() => void>()

  constructor(settings: GameSettings, seed: string) {
    this.settings = settings
    this.seed = seed
    this.maze = generateMaze({ ...resolveSize(settings), algorithm: settings.algorithm, seed })
    this.player = this.maze.start
    this.optimalMoves = (findPath(this.maze, this.maze.start, this.maze.end)?.length ?? 1) - 1
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
    return Number.isFinite(this.fogRadius)
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

  elapsed(now: number): number {
    if (this.startedAt === null) return 0
    return (this.finishedAt ?? now) - this.startedAt
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

  /** Moves one cell in `dir` if no wall blocks it. Returns whether the player moved. */
  move(dir: Direction, now: number): boolean {
    if (this.awaitingStart || this.finished || !canMove(this.maze, this.player, dir)) return false
    this.startClock(now)
    const from = this.player
    this.player = neighbor(this.maze, from, dir)
    this.trail[from] |= DIRECTIONS[dir].wall
    this.trail[this.player] |= DIRECTIONS[DIRECTIONS[dir].opposite].wall
    this.visited[this.player] = 1
    this.moves++
    if (this.fogEnabled) this.updateVision()
    if (this.player === this.maze.end) this.finishedAt = now
    this.changed()
    return true
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
    if (this.awaitingStart || target < 0 || target >= this.visited.length) return null
    if (!this.visited[target]) {
      const dir = directionBetween(this.maze, from, target)
      return dir && canMove(this.maze, from, dir) ? [target] : null
    }
    const path = findPath(this.maze, from, target, (cell) => this.visited[cell] === 1)
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
    if (this.awaitingStart || this.finished) return false
    this.finishedAt = now
    this.gaveUp = true
    this.solution = findPath(this.maze, this.player, this.maze.end)
    this.hint = null
    this.explored.fill(1)
    this.visible.fill(1)
    this.changed()
    return true
  }

  useHint(now: number): boolean {
    if (this.awaitingStart || this.finished || this.hintsRemaining <= 0) return false
    const path = findPath(this.maze, this.player, this.maze.end)
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

  /** Shortest route to a cell within `TRACE_GAP_STEPS` of `from`, walked or not. */
  private shortHop(target: number, from: number): number[] | null {
    const { dist, prev } = bfs(this.maze, from, undefined, TRACE_GAP_STEPS)
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
    const { dist } = bfs(this.maze, this.player, undefined, this.fogRadius)
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
