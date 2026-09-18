/**
 * Grid maze model. Each cell stores a bitmask of the walls still standing on
 * its four sides; walls are always kept symmetric between neighbouring cells.
 */

export const WALL_N = 1
export const WALL_E = 2
export const WALL_S = 4
export const WALL_W = 8
export const ALL_WALLS = WALL_N | WALL_E | WALL_S | WALL_W

export type Direction = 'up' | 'right' | 'down' | 'left'

interface DirectionInfo {
  wall: number
  dx: number
  dy: number
  opposite: Direction
}

export const DIRECTIONS: Record<Direction, DirectionInfo> = {
  up: { wall: WALL_N, dx: 0, dy: -1, opposite: 'down' },
  right: { wall: WALL_E, dx: 1, dy: 0, opposite: 'left' },
  down: { wall: WALL_S, dx: 0, dy: 1, opposite: 'up' },
  left: { wall: WALL_W, dx: -1, dy: 0, opposite: 'right' }
}

export const DIRECTION_LIST: readonly Direction[] = ['up', 'right', 'down', 'left']

export interface Maze {
  width: number
  height: number
  /** Wall bitmask per cell, indexed by y * width + x. */
  walls: Uint8Array
  start: number
  end: number
}

export function createGrid(width: number, height: number): Maze {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Invalid maze size ${width}x${height}`)
  }
  return {
    width,
    height,
    walls: new Uint8Array(width * height).fill(ALL_WALLS),
    start: 0,
    end: width * height - 1
  }
}

export const cellCount = (maze: Maze): number => maze.width * maze.height
export const cellX = (maze: Maze, cell: number): number => cell % maze.width
export const cellY = (maze: Maze, cell: number): number => Math.floor(cell / maze.width)

export function cellAt(maze: Maze, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= maze.width || y >= maze.height) return -1
  return y * maze.width + x
}

/** Index of the neighbouring cell in `dir`, or -1 when outside the grid. */
export function neighbor(maze: Maze, cell: number, dir: Direction): number {
  const { dx, dy } = DIRECTIONS[dir]
  return cellAt(maze, cellX(maze, cell) + dx, cellY(maze, cell) + dy)
}

export function hasWall(maze: Maze, cell: number, dir: Direction): boolean {
  return (maze.walls[cell] & DIRECTIONS[dir].wall) !== 0
}

/** Removes the wall between `cell` and its neighbour in `dir`. */
export function carve(maze: Maze, cell: number, dir: Direction): void {
  const other = neighbor(maze, cell, dir)
  if (other < 0) throw new Error('Cannot carve through the maze border')
  const info = DIRECTIONS[dir]
  maze.walls[cell] &= ~info.wall
  maze.walls[other] &= ~DIRECTIONS[info.opposite].wall
}

export function canMove(maze: Maze, cell: number, dir: Direction): boolean {
  return !hasWall(maze, cell, dir) && neighbor(maze, cell, dir) >= 0
}

export function openNeighbors(maze: Maze, cell: number): number[] {
  const result: number[] = []
  for (const dir of DIRECTION_LIST) {
    if (canMove(maze, cell, dir)) result.push(neighbor(maze, cell, dir))
  }
  return result
}

/** Direction from `from` to an orthogonally adjacent `to`, or null if not adjacent. */
export function directionBetween(maze: Maze, from: number, to: number): Direction | null {
  for (const dir of DIRECTION_LIST) {
    if (neighbor(maze, from, dir) === to) return dir
  }
  return null
}
