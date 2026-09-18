import { carve, cellCount, DIRECTION_LIST, neighbor, type Direction } from '../maze'
import type { MazeGenerator } from './types'

/** Wilson's algorithm: loop-erased random walks give a uniform spanning tree (no bias). */
export const wilsons: MazeGenerator = {
  id: 'wilsons',
  name: "Wilson's",
  description: 'Unbiased: every possible maze is equally likely. No visual texture.',
  carve(maze, rng) {
    const n = cellCount(maze)
    const inMaze = new Uint8Array(n)
    // Last direction taken out of each cell during the current walk. Overwriting
    // it when the walk revisits a cell is what erases loops.
    const exit = new Array<Direction>(n)
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i))

    inMaze[order[0]] = 1
    for (const start of order) {
      if (inMaze[start]) continue

      let cell = start
      while (!inMaze[cell]) {
        const options = DIRECTION_LIST.filter((dir) => neighbor(maze, cell, dir) >= 0)
        const dir = rng.pick(options)
        exit[cell] = dir
        cell = neighbor(maze, cell, dir)
      }

      cell = start
      while (!inMaze[cell]) {
        const dir = exit[cell]
        carve(maze, cell, dir)
        inMaze[cell] = 1
        cell = neighbor(maze, cell, dir)
      }
    }
  }
}
