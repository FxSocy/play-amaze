import { carve, cellCount, DIRECTION_LIST, neighbor } from '../maze'
import type { MazeGenerator } from './types'

/** Randomized Prim's: grows outward from a seed cell, lots of short dead ends. */
export const prims: MazeGenerator = {
  id: 'prims',
  name: "Prim's",
  description: 'Grows outward from one point; many short branches and dead ends.',
  carve(maze, rng) {
    const n = cellCount(maze)
    const inMaze = new Uint8Array(n)
    const inFrontier = new Uint8Array(n)
    const frontier: number[] = []

    const add = (cell: number): void => {
      inMaze[cell] = 1
      for (const dir of DIRECTION_LIST) {
        const next = neighbor(maze, cell, dir)
        if (next >= 0 && !inMaze[next] && !inFrontier[next]) {
          inFrontier[next] = 1
          frontier.push(next)
        }
      }
    }

    add(rng.int(n))
    while (frontier.length > 0) {
      const index = rng.int(frontier.length)
      const cell = frontier[index]
      frontier[index] = frontier[frontier.length - 1]
      frontier.pop()
      const connections = DIRECTION_LIST.filter((dir) => {
        const next = neighbor(maze, cell, dir)
        return next >= 0 && inMaze[next] === 1
      })
      carve(maze, cell, rng.pick(connections))
      add(cell)
    }
  }
}
