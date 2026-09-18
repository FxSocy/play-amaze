import { DIRECTIONS, type Direction } from './maze'

/**
 * Touch steering: turning a finger drag into a direction to walk.
 *
 * Pure geometry, kept out of the renderer so it can be reasoned about and
 * tested on its own — the feel of the controls lives or dies on these numbers.
 */

/** Finger travel (px) from the joystick's origin before it starts steering. */
export const TOUCH_DEAD_ZONE = 18

/**
 * The origin trails the finger at this distance. Without it the origin stays
 * where the finger first landed, so after a long drag one way, turning means
 * dragging all the way back past the diagonal — which reads as the controls
 * ignoring you.
 */
export const STEER_RADIUS = 40

/** How far the new axis must beat the current one to take over, so a drag near the diagonal holds its line. */
export const STEER_HYSTERESIS = 1.4

export interface Point {
  x: number
  y: number
}

/**
 * Direction for a drag of (dx, dy) from the joystick origin, given the
 * direction being steered now. Reversing along the current axis is immediate;
 * crossing to the other axis has to win by `STEER_HYSTERESIS`.
 */
export function steerDirection(dx: number, dy: number, current: Direction | null): Direction | null {
  if (Math.hypot(dx, dy) < TOUCH_DEAD_ZONE) return null
  const horizontal = Math.abs(dx) > Math.abs(dy)
  const candidate: Direction = horizontal ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
  if (!current || candidate === current) return candidate
  const currentIsHorizontal = current === 'left' || current === 'right'
  if (currentIsHorizontal === horizontal) return candidate
  const [lead, across] = horizontal ? [Math.abs(dx), Math.abs(dy)] : [Math.abs(dy), Math.abs(dx)]
  return lead > across * STEER_HYSTERESIS ? candidate : current
}

/** Pulls the joystick origin along so it stays within `STEER_RADIUS` of the finger. */
export function trailOrigin(origin: Point, x: number, y: number): Point {
  const dx = x - origin.x
  const dy = y - origin.y
  const travel = Math.hypot(dx, dy)
  if (travel <= STEER_RADIUS) return origin
  return { x: x - (dx / travel) * STEER_RADIUS, y: y - (dy / travel) * STEER_RADIUS }
}

export interface Steering {
  origin: Point
  direction: Direction | null
}

/**
 * Where a turn re-anchors the origin: just past the dead zone along the new
 * direction, so the leg just finished leaves no pull behind and the next turn
 * is measured from here — without a gap where nothing is being steered.
 */
function anchorFor(direction: Direction, x: number, y: number): Point {
  const { dx, dy } = DIRECTIONS[direction]
  const offset = TOUCH_DEAD_ZONE + 4
  return { x: x - dx * offset, y: y - dy * offset }
}

/**
 * Advances the joystick for a finger at (x, y).
 *
 * Turning re-anchors; carrying on lets the origin trail. Together those are
 * what make a long drag with several turns feel like a joystick rather than a
 * gesture measured from wherever the finger first touched down.
 */
export function steer(state: Steering, x: number, y: number): Steering {
  const direction = steerDirection(x - state.origin.x, y - state.origin.y, state.direction)
  if (direction && direction !== state.direction) {
    return { direction, origin: anchorFor(direction, x, y) }
  }
  return { direction, origin: trailOrigin(state.origin, x, y) }
}
