import { describe, expect, it } from 'vitest'
import type { Direction } from './maze'
import { steer, steerDirection, STEER_RADIUS, TOUCH_DEAD_ZONE, trailOrigin } from './steering'

/** Replays a finger path through the steering logic, returning the directions it produced. */
function drag(points: [number, number][]): (Direction | null)[] {
  let state = { origin: { x: points[0][0], y: points[0][1] }, direction: null as Direction | null }
  return points.slice(1).map(([x, y]) => {
    state = steer(state, x, y)
    return state.direction
  })
}

describe('touch steering', () => {
  it('ignores movement inside the dead zone', () => {
    expect(steerDirection(0, 0, null)).toBeNull()
    expect(steerDirection(TOUCH_DEAD_ZONE - 1, 0, null)).toBeNull()
    expect(steerDirection(TOUCH_DEAD_ZONE + 1, 0, null)).toBe('right')
  })

  it('reads the four directions from a clear drag', () => {
    expect(steerDirection(60, 0, null)).toBe('right')
    expect(steerDirection(-60, 0, null)).toBe('left')
    expect(steerDirection(0, 60, null)).toBe('down')
    expect(steerDirection(0, -60, null)).toBe('up')
  })

  it('holds its line near the diagonal instead of flip-flopping', () => {
    // Steering right, with the drag drifting down at almost the same rate.
    expect(steerDirection(50, 49, 'right')).toBe('right')
    expect(steerDirection(50, 55, 'right')).toBe('right')
    // A decisive turn still takes over.
    expect(steerDirection(50, 80, 'right')).toBe('down')
  })

  it('reverses along the axis it is already steering immediately', () => {
    expect(steerDirection(-30, 0, 'right')).toBe('left')
    expect(steerDirection(0, -30, 'down')).toBe('up')
  })

  /**
   * The bug this fixes: with a fixed origin, a drag 120px right then 60px down
   * stays "right", because the down component never beats the right one. The
   * player feels the controls ignoring them mid-drag.
   */
  it('turns mid-drag however far the finger has already travelled', () => {
    const fixedOrigin = steerDirection(120, 60, 'right')
    expect(fixedOrigin).toBe('right')

    const steered = drag([
      [100, 100],
      [160, 100], // right
      [220, 100], // still right, far from where the finger landed
      [220, 160], // turn down
      [220, 220], // still down
      [160, 220] // turn left
    ])
    expect(steered).toEqual(['right', 'right', 'down', 'down', 'left'])
  })

  it('keeps steering through a long path of turns', () => {
    // Four sides of a square, without lifting the finger.
    expect(
      drag([
        [200, 400],
        [260, 400],
        [320, 400],
        [320, 460],
        [320, 520],
        [260, 520],
        [200, 520],
        [200, 460],
        [200, 400]
      ])
    ).toEqual(['right', 'right', 'down', 'down', 'left', 'left', 'up', 'up'])
  })

  it('keeps the origin within one radius of the finger', () => {
    expect(trailOrigin({ x: 0, y: 0 }, 10, 0)).toEqual({ x: 0, y: 0 })
    const pulled = trailOrigin({ x: 0, y: 0 }, 200, 0)
    expect(pulled.x).toBeCloseTo(200 - STEER_RADIUS)
    expect(Math.hypot(200 - pulled.x, 0 - pulled.y)).toBeCloseTo(STEER_RADIUS)
  })
})
