import { carve, cellCount, neighbor } from '../maze'
import type { MazeGenerator } from './types'

/** Randomized Kruskal's: merges random regions; uniform-looking with many junctions. */
export const kruskal: MazeGenerator = {
  id: 'kruskal',
  name: "Kruskal's",
  description: 'Joins random regions together; evenly textured with lots of junctions.',
  carve(maze, rng) {
    const n = cellCount(maze)
    const parent = new Int32Array(n)
    for (let i = 0; i < n; i++) parent[i] = i
    const find = (cell: number): number => {
      while (parent[cell] !== cell) {
        parent[cell] = parent[parent[cell]]
        cell = parent[cell]
      }
      return cell
    }

    // Each edge is encoded as cell * 2 + (0 = east wall, 1 = south wall).
    const edges: number[] = []
    for (let cell = 0; cell < n; cell++) {
      if (neighbor(maze, cell, 'right') >= 0) edges.push(cell * 2)
      if (neighbor(maze, cell, 'down') >= 0) edges.push(cell * 2 + 1)
    }
    rng.shuffle(edges)

    for (const edge of edges) {
      const cell = edge >> 1
      const dir = edge & 1 ? 'down' : 'right'
      const a = find(cell)
      const b = find(neighbor(maze, cell, dir))
      if (a === b) continue
      parent[a] = b
      carve(maze, cell, dir)
    }
  }
}
