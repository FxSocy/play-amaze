import { createGrid, type Maze } from '../maze'
import { createRng } from '../rng'
import { farthestCell } from '../solver'
import { backtracker } from './backtracker'
import { kruskal } from './kruskal'
import { prims } from './prims'
import type { AlgorithmId, MazeGenerator } from './types'
import { wilsons } from './wilsons'

export type { AlgorithmId, MazeGenerator } from './types'

export const GENERATORS: Record<AlgorithmId, MazeGenerator> = {
  backtracker,
  prims,
  kruskal,
  wilsons
}

export const ALGORITHM_IDS = Object.keys(GENERATORS) as AlgorithmId[]

export interface GenerateOptions {
  width: number
  height: number
  algorithm: AlgorithmId
  seed: string
}

/**
 * Builds a perfect maze deterministically from (seed, algorithm, size).
 * Start and exit are placed at the two ends of the maze's longest path.
 */
export function generateMaze({ width, height, algorithm, seed }: GenerateOptions): Maze {
  const maze = createGrid(width, height)
  GENERATORS[algorithm].carve(maze, createRng(seed))
  maze.start = farthestCell(maze, 0)
  maze.end = farthestCell(maze, maze.start)
  return maze
}
