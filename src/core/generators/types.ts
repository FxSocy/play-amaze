import type { Maze } from '../maze'
import type { Rng } from '../rng'

export type AlgorithmId = 'backtracker' | 'prims' | 'kruskal' | 'wilsons'

export interface MazeGenerator {
  id: AlgorithmId
  name: string
  description: string
  /** Carves passages into a fully walled grid, producing a perfect maze. */
  carve(maze: Maze, rng: Rng): void
}
