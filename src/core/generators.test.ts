import { describe, expect, it } from 'vitest'
import { ALGORITHM_IDS, generateMaze } from './generators'
import { cellCount, DIRECTION_LIST, DIRECTIONS, hasWall, neighbor, type Maze } from './maze'
import { bfs } from './solver'

const SIZES = [
  [1, 1],
  [1, 12],
  [12, 1],
  [2, 2],
  [15, 10],
  [37, 23]
] as const

function passageCount(maze: Maze): number {
  let count = 0
  for (let cell = 0; cell < cellCount(maze); cell++) {
    if (!hasWall(maze, cell, 'right')) count++
    if (!hasWall(maze, cell, 'down')) count++
  }
  return count
}

describe.each(ALGORITHM_IDS)('%s generator', (algorithm) => {
  it.each(SIZES)('builds a perfect maze at %ix%i', (width, height) => {
    const maze = generateMaze({ width, height, algorithm, seed: `test-${width}-${height}` })
    const n = cellCount(maze)

    for (let cell = 0; cell < n; cell++) {
      for (const dir of DIRECTION_LIST) {
        const other = neighbor(maze, cell, dir)
        if (other < 0) {
          expect(hasWall(maze, cell, dir), 'border wall intact').toBe(true)
        } else {
          expect(hasWall(maze, cell, dir), 'walls are symmetric').toBe(hasWall(maze, other, DIRECTIONS[dir].opposite))
        }
      }
    }

    // Connected with exactly n - 1 passages => spanning tree => no loops.
    const { dist } = bfs(maze, 0)
    expect(dist.every((d) => d >= 0)).toBe(true)
    expect(passageCount(maze)).toBe(n - 1)
  })

  it('is deterministic for a seed', () => {
    const a = generateMaze({ width: 20, height: 20, algorithm, seed: 'same' })
    const b = generateMaze({ width: 20, height: 20, algorithm, seed: 'same' })
    expect(a).toEqual(b)
  })

  it('varies with the seed', () => {
    const a = generateMaze({ width: 20, height: 20, algorithm, seed: 'one' })
    const b = generateMaze({ width: 20, height: 20, algorithm, seed: 'two' })
    expect(a.walls).not.toEqual(b.walls)
  })

  it('places start and exit at the ends of the longest path', () => {
    const maze = generateMaze({ width: 25, height: 15, algorithm, seed: 'ends' })
    const fromStart = bfs(maze, maze.start).dist
    const eccentricity = Math.max(...fromStart)
    expect(fromStart[maze.end]).toBe(eccentricity)
    for (let cell = 0; cell < cellCount(maze); cell += 17) {
      expect(Math.max(...bfs(maze, cell).dist)).toBeLessThanOrEqual(eccentricity)
    }
  })
})
