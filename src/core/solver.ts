import { cellCount, openNeighbors, type Maze } from './maze'

export interface BfsResult {
  /** Steps from the origin, -1 when unreachable. */
  dist: Int32Array
  /** Previous cell on a shortest path, -1 for the origin / unreachable cells. */
  prev: Int32Array
}

export interface SearchOptions {
  /** Restricts which cells may be entered; the origin is always allowed. */
  passable?: (cell: number) => boolean
  /** Stops the search this many steps out. */
  maxDepth?: number
}

/**
 * Breadth-first search through open passages.
 *
 * This is the plain-maze search: walls are the only thing it knows about. A
 * maze carrying Arcade features needs `planRoute` in `arcade.ts` instead, which
 * understands portals, keys, gates and one-way doors.
 */
export function bfs(maze: Maze, from: number, options: SearchOptions = {}): BfsResult {
  const { passable, maxDepth = Infinity } = options
  const n = cellCount(maze)
  const dist = new Int32Array(n).fill(-1)
  const prev = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  dist[from] = 0
  queue[tail++] = from
  while (head < tail) {
    const cell = queue[head++]
    if (dist[cell] >= maxDepth) continue
    for (const next of openNeighbors(maze, cell)) {
      if (dist[next] !== -1 || (passable && !passable(next))) continue
      dist[next] = dist[cell] + 1
      prev[next] = cell
      queue[tail++] = next
    }
  }
  return { dist, prev }
}

/** Shortest path including both endpoints, or null when unreachable. */
export function findPath(maze: Maze, from: number, to: number, options: SearchOptions = {}): number[] | null {
  const { dist, prev } = bfs(maze, from, options)
  if (dist[to] === -1) return null
  const path: number[] = []
  for (let cell = to; cell !== -1; cell = prev[cell]) path.push(cell)
  return path.reverse()
}

/** The reachable cell furthest from `from` (lowest index wins ties). */
export function farthestCell(maze: Maze, from: number): number {
  const { dist } = bfs(maze, from)
  let best = from
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] > dist[best]) best = i
  }
  return best
}
