import { carve, cellCount, DIRECTION_LIST, neighbor } from '../maze'
import type { MazeGenerator } from './types'

/** Randomized depth-first search: long winding corridors, few short dead ends. */
export const backtracker: MazeGenerator = {
  id: 'backtracker',
  name: 'Recursive Backtracker',
  description: 'Long, winding corridors with relatively few dead ends.',
  carve(maze, rng) {
    const visited = new Uint8Array(cellCount(maze))
    const first = rng.int(visited.length)
    visited[first] = 1
    const stack = [first]
    while (stack.length > 0) {
      const cell = stack[stack.length - 1]
      const options = DIRECTION_LIST.filter((dir) => {
        const next = neighbor(maze, cell, dir)
        return next >= 0 && !visited[next]
      })
      if (options.length === 0) {
        stack.pop()
        continue
      }
      const dir = rng.pick(options)
      const next = neighbor(maze, cell, dir)
      carve(maze, cell, dir)
      visited[next] = 1
      stack.push(next)
    }
  }
}
