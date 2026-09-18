import { describe, expect, it } from 'vitest'
import { carve, cellAt, createGrid } from './maze'
import { bfs, farthestCell, findPath } from './solver'

// 3x2 grid shaped like a "U":  0 1 2 / 3 4 5 with passages 0-3, 3-4, 4-5, 5-2, 1-4
function uMaze() {
  const maze = createGrid(3, 2)
  carve(maze, 0, 'down')
  carve(maze, 3, 'right')
  carve(maze, 4, 'right')
  carve(maze, 5, 'up')
  carve(maze, 1, 'down')
  return maze
}

describe('solver', () => {
  it('finds the shortest path including endpoints', () => {
    expect(findPath(uMaze(), 0, 2)).toEqual([0, 3, 4, 5, 2])
    expect(findPath(uMaze(), 1, 1)).toEqual([1])
  })

  it('returns null when a wall blocks every route', () => {
    const maze = createGrid(2, 1)
    expect(findPath(maze, 0, 1)).toBeNull()
  })

  it('respects the passable filter', () => {
    const maze = uMaze()
    expect(findPath(maze, 0, 2, (cell) => cell !== 4)).toBeNull()
  })

  it('stops at maxDepth', () => {
    const { dist } = bfs(uMaze(), 0, undefined, 2)
    expect(dist[cellAt(uMaze(), 1, 1)]).toBe(2)
    expect(dist[5]).toBe(-1)
  })

  it('finds the farthest cell', () => {
    expect(farthestCell(uMaze(), 0)).toBe(2)
  })
})
