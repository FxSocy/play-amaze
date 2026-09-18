import { useCallback, useEffect, useRef } from 'react'
import type { Appearance, Palette } from '../../../core/appearance'
import { cellAt, cellX, cellY, type Direction } from '../../../core/maze'
import type { GameSession } from '../../../core/session'
import {
  fitCamera,
  focusCamera,
  followPoint,
  MIN_TOUCH_SCALE,
  pan,
  screenToCell,
  zoomAt,
  type Camera,
  type Viewport
} from './camera'
import { drawScene } from './draw'
import { Dpad } from '../components/Dpad'
import { steer as advanceSteering, type Steering } from '../../../core/steering'
import { useIsTouch } from '../theme'

/** Duration of the tween between two cells for keyboard steps. */
const STEP_MS = 90
/** Mouse routes can be long, so they are walked faster. */
const ROUTE_STEP_MS = 45
/** How long a key must be held before it starts auto-repeating steps. */
const HOLD_DELAY_MS = 180
/** Pointer travel (px) that turns a click into a drag. */
const DRAG_THRESHOLD = 4
/** A touch that moves less than this, for less than TAP_MS, is a tap rather than a drag. */
const TAP_SLOP = 12
const TAP_MS = 350

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  // Gamer
  KeyW: 'up',
  KeyD: 'right',
  KeyS: 'down',
  KeyA: 'left',
  // Vim
  KeyK: 'up',
  KeyL: 'right',
  KeyJ: 'down',
  KeyH: 'left'
}

type PointerMode =
  | { kind: 'pending'; startX: number; startY: number; lastX: number; lastY: number; onPlayer: boolean }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'trace'; lastCell: number }

/**
 * Touch works differently from the mouse: one finger plays (tap to walk, drag
 * as a joystick), two fingers move the view. Tracing a route by dragging from
 * the player stays mouse-only — the dot is too small to hit on a phone, and the
 * joystick covers the same ground.
 */
type TouchMode =
  | {
      kind: 'steer'
      id: number
      /** Where the finger landed. Only for telling a tap from a drag: the steering origin moves. */
      start: { x: number; y: number }
      steering: Steering
      startedAt: number
      moved: boolean
    }
  | { kind: 'view'; lastCenter: [number, number]; lastDistance: number }
  /** After a two-finger gesture, ignore the fingers still down so the maze doesn't lurch. */
  | { kind: 'settling' }

interface Props {
  session: GameSession
  /** False while a dialog is open, so keys and clicks don't move the player. */
  inputEnabled: boolean
  /** Bumped by the parent to reset the camera to fit the whole maze. */
  fitRequest: number
  breadcrumbs: boolean
  appearance: Appearance
  /** Resolved colours, including any custom dot colour. */
  palette: Palette
}

/** How long a wall bump stays quiet for, so holding into a wall doesn't buzz continuously. */
const BUMP_INTERVAL_MS = 450

/** A short buzz where the device supports it; iOS Safari has no vibration API. */
function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Some browsers throw when vibration is blocked by a permissions policy.
  }
}

export function GameCanvas({ session, inputEnabled, fitRequest, breadcrumbs, appearance, palette }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputEnabledRef = useRef(inputEnabled)
  inputEnabledRef.current = inputEnabled
  const breadcrumbsRef = useRef(breadcrumbs)
  breadcrumbsRef.current = breadcrumbs
  const appearanceRef = useRef({ appearance, palette })
  appearanceRef.current = { appearance, palette }
  const touch = useIsTouch()
  const touchRef = useRef(touch)
  touchRef.current = touch

  /**
   * Steers like a held arrow key. Shared by the drag-joystick and the D-pad, so
   * every input drives movement through exactly the same path.
   */
  const steerTo = useCallback((direction: Direction | null) => {
    const st = state.current
    st.held.clear()
    if (!direction) return
    st.route = []
    st.buffered = direction
    // Backdated past the hold delay: a keyboard waits before repeating so a tap
    // is one step, but a touch control that pauses after its first step feels broken.
    st.held.set(direction, performance.now() - HOLD_DELAY_MS)
  }, [])

  // Mutable game-loop state lives in a ref so per-frame updates never re-render React.
  const state = useRef({
    view: { width: 0, height: 0 } as Viewport,
    camera: { scale: 1, x: 0, y: 0, fit: true } as Camera,
    anim: { from: session.player, to: session.player, start: 0, duration: STEP_MS },
    route: [] as number[],
    buffered: null as Direction | null,
    held: new Map<Direction, number>(),
    pointer: null as PointerMode | null,
    touch: null as TouchMode | null,
    /** When the last wall bump buzzed, so a held direction doesn't rattle. */
    bumpedAt: 0,
    /** The session already celebrated, so finishing buzzes once. */
    celebrated: null as GameSession | null,
    /** Live touch points, so gestures can tell one finger from two. */
    touches: new Map<number, { x: number; y: number }>()
  })

  /** The Fit control: the whole maze, however small that makes the cells. */
  const refit = (): void => {
    const st = state.current
    st.camera = fitCamera(st.view, session.maze.width, session.maze.height)
  }

  /**
   * The camera a maze opens with. Fitting the whole maze is right with a mouse,
   * but on a phone it leaves cells too small to tap, so touch devices start
   * zoomed in on the player and pan from there.
   */
  const resetCamera = (): void => {
    const st = state.current
    const { width, height } = session.maze
    const fitted = fitCamera(st.view, width, height)
    if (!touchRef.current || fitted.scale >= MIN_TOUCH_SCALE) {
      st.camera = fitted
      return
    }
    st.camera = focusCamera(
      st.view,
      width,
      height,
      cellX(session.maze, session.player) + 0.5,
      cellY(session.maze, session.player) + 0.5,
      MIN_TOUCH_SCALE
    )
  }

  // Reset per-maze state whenever a new session starts.
  useEffect(() => {
    const st = state.current
    st.anim = { from: session.player, to: session.player, start: 0, duration: STEP_MS }
    st.route = []
    st.buffered = null
    st.pointer = null
    st.touch = null
    st.touches.clear()
    resetCamera()
  }, [session])

  useEffect(() => {
    if (fitRequest > 0) refit()
  }, [fitRequest])

  useEffect(() => {
    if (!inputEnabled) {
      state.current.held.clear()
      state.current.route = []
      state.current.pointer = null
      state.current.touch = null
      state.current.touches.clear()
    }
  }, [inputEnabled])

  // Canvas sizing, theme tracking and the render loop.
  useEffect(() => {
    const container = containerRef.current!
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const st = state.current

    const resize = (): void => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      st.view = { width: rect.width, height: rect.height }
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      if (st.camera.fit) resetCamera()
      else st.camera = pan(st.camera, 0, 0, st.view, session.maze.width, session.maze.height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    let frame = 0
    const tick = (): void => {
      const now = performance.now()
      stepMovement(now)

      const t = Math.min(1, (now - st.anim.start) / st.anim.duration)
      const eased = 1 - (1 - t) * (1 - t)
      const maze = session.maze
      const playerX = cellX(maze, st.anim.from) + (cellX(maze, st.anim.to) - cellX(maze, st.anim.from)) * eased
      const playerY = cellY(maze, st.anim.from) + (cellY(maze, st.anim.to) - cellY(maze, st.anim.from)) * eased
      st.camera = followPoint(st.camera, playerX + 0.5, playerY + 0.5, st.view)

      const dpr = canvas.width / Math.max(1, st.view.width)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const { appearance, palette } = appearanceRef.current
      const scene = {
        session,
        camera: st.camera,
        view: st.view,
        playerX,
        playerY,
        route: st.route,
        showTrail: breadcrumbsRef.current,
        style: appearance.mazeStyle,
        dotShape: appearance.dotShape,
        now
      }
      drawScene(ctx, scene, palette)
      if (session.solved && st.celebrated !== session) {
        st.celebrated = session
        if (touchRef.current) vibrate([18, 60, 30])
      }
      frame = requestAnimationFrame(tick)
    }

    const stepMovement = (now: number): void => {
      if (now - st.anim.start < st.anim.duration || session.finished) return
      const moved = (duration = STEP_MS): void => {
        st.anim = { from: st.anim.to, to: session.player, start: now, duration }
      }
      st.anim.from = st.anim.to = session.player

      if (st.buffered) {
        const dir = st.buffered
        st.buffered = null
        if (session.move(dir, now)) return moved()
      }
      if (st.route.length > 0) {
        if (session.moveTo(st.route[0], now)) {
          st.route.shift()
          return moved(ROUTE_STEP_MS)
        }
        st.route = []
      }
      // Most recently pressed key that has been held past the repeat delay.
      let heldDir: Direction | null = null
      for (const [dir, pressedAt] of st.held) {
        if (now - pressedAt >= HOLD_DELAY_MS) heldDir = dir
      }
      if (!heldDir) return
      if (session.move(heldDir, now)) return moved()
      // Walked into a wall: on a touch device a short bump explains the stop,
      // rate limited so holding against a wall doesn't buzz continuously.
      if (touchRef.current && now - st.bumpedAt > BUMP_INTERVAL_MS) {
        st.bumpedAt = now
        vibrate(12)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [session])

  // Keyboard movement.
  useEffect(() => {
    const st = state.current
    const onKeyDown = (e: KeyboardEvent): void => {
      const dir = KEY_DIRECTIONS[e.code]
      if (!dir || !inputEnabledRef.current || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      if (e.repeat) return
      st.route = []
      // Re-insert so the newest key is last in iteration order.
      st.held.delete(dir)
      st.held.set(dir, performance.now())
      st.buffered = dir
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      const dir = KEY_DIRECTIONS[e.code]
      if (dir) st.held.delete(dir)
    }
    const onBlur = (): void => st.held.clear()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Mouse: click to backtrack, drag from the player to trace, drag elsewhere to pan, wheel to zoom.
  useEffect(() => {
    const canvas = canvasRef.current!
    const st = state.current
    const maze = session.maze

    const local = (e: PointerEvent | WheelEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }
    const cellUnder = (sx: number, sy: number): number => {
      const { x, y } = screenToCell(st.camera, sx, sy)
      return cellAt(maze, x, y)
    }

    // --- touch -------------------------------------------------------------

    const steer = steerTo

    const centerOf = (points: { x: number; y: number }[]): [number, number] => [
      points.reduce((sum, p) => sum + p.x, 0) / points.length,
      points.reduce((sum, p) => sum + p.y, 0) / points.length
    ]
    const distanceOf = ([a, b]: { x: number; y: number }[]): number => Math.hypot(a.x - b.x, a.y - b.y)

    const onTouchDown = (e: PointerEvent, sx: number, sy: number): void => {
      st.touches.set(e.pointerId, { x: sx, y: sy })
      const points = [...st.touches.values()]
      if (points.length === 1) {
        st.touch = {
          kind: 'steer',
          id: e.pointerId,
          start: { x: sx, y: sy },
          steering: { origin: { x: sx, y: sy }, direction: null },
          startedAt: performance.now(),
          moved: false
        }
        return
      }
      // A second finger turns the gesture into panning and zooming.
      steer(null)
      st.touch = points.length === 2
        ? { kind: 'view', lastCenter: centerOf(points), lastDistance: distanceOf(points) }
        : { kind: 'settling' }
    }

    const onTouchMove = (e: PointerEvent, sx: number, sy: number): void => {
      if (!st.touches.has(e.pointerId)) return
      st.touches.set(e.pointerId, { x: sx, y: sy })
      const mode = st.touch
      if (!mode) return

      if (mode.kind === 'view') {
        const points = [...st.touches.values()]
        if (points.length !== 2) return
        const center = centerOf(points)
        const distance = distanceOf(points)
        st.camera = pan(st.camera, center[0] - mode.lastCenter[0], center[1] - mode.lastCenter[1], st.view, maze.width, maze.height)
        if (mode.lastDistance > 0 && distance > 0) {
          st.camera = zoomAt(st.camera, distance / mode.lastDistance, center[0], center[1], st.view, maze.width, maze.height)
        }
        mode.lastCenter = center
        mode.lastDistance = distance
        return
      }

      if (mode.kind !== 'steer' || mode.id !== e.pointerId) return
      if (Math.hypot(sx - mode.start.x, sy - mode.start.y) > TAP_SLOP) mode.moved = true
      const previous = mode.steering.direction
      mode.steering = advanceSteering(mode.steering, sx, sy)
      if (mode.steering.direction !== previous) steer(mode.steering.direction)
    }

    /** The closest orthogonal neighbour of the tapped cell that can be walked to. */
    const nearbyRoute = (sx: number, sy: number): number[] | null => {
      const { x, y } = screenToCell(st.camera, sx, sy)
      const candidates: { cell: number; distance: number }[] = []
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const cell = cellAt(maze, Math.floor(x) + dx, Math.floor(y) + dy)
        if (cell < 0) continue
        candidates.push({ cell, distance: Math.hypot(Math.floor(x) + dx + 0.5 - x, Math.floor(y) + dy + 0.5 - y) })
      }
      candidates.sort((a, b) => a.distance - b.distance)
      for (const { cell } of candidates) {
        const route = session.routeTo(cell)
        if (route && route.length > 0) return route
      }
      return null
    }

    const onTouchUp = (e: PointerEvent, sx: number, sy: number): void => {
      const mode = st.touch
      st.touches.delete(e.pointerId)
      steer(null)
      if (st.touches.size > 0) {
        // Fingers left over from a pinch would otherwise be read as a new drag.
        st.touch = { kind: 'settling' }
        return
      }
      st.touch = null
      if (mode?.kind !== 'steer' || mode.id !== e.pointerId) return
      if (mode.moved || performance.now() - mode.startedAt > TAP_MS) return
      // A tap walks like a click: back over visited cells, or one step into a
      // neighbour. Cells are small under a fingertip, so a miss falls back to the
      // nearest neighbouring cell that was a legal target anyway - forgiving the
      // aim, never widening where a tap is allowed to go.
      const route = session.routeTo(cellUnder(sx, sy)) ?? nearbyRoute(sx, sy)
      if (route) {
        st.buffered = null
        st.route = route
      }
    }

    // --- mouse ---------------------------------------------------------------

    const onPointerDown = (e: PointerEvent): void => {
      if (!inputEnabledRef.current) return
      const [sx, sy] = local(e)
      canvas.setPointerCapture(e.pointerId)
      if (e.pointerType === 'touch') return onTouchDown(e, sx, sy)
      if (e.button === 0) {
        const onPlayer = cellUnder(sx, sy) === session.player
        st.pointer = { kind: 'pending', startX: sx, startY: sy, lastX: sx, lastY: sy, onPlayer }
      } else {
        st.pointer = { kind: 'pan', lastX: sx, lastY: sy }
      }
    }

    const onPointerMove = (e: PointerEvent): void => {
      const [sx, sy] = local(e)
      if (e.pointerType === 'touch') return onTouchMove(e, sx, sy)
      const mode = st.pointer
      if (!mode) return
      if (mode.kind === 'pending') {
        if (Math.hypot(sx - mode.startX, sy - mode.startY) < DRAG_THRESHOLD) return
        if (mode.onPlayer) {
          st.route = []
          st.pointer = { kind: 'trace', lastCell: session.player }
        } else {
          st.pointer = { kind: 'pan', lastX: mode.lastX, lastY: mode.lastY }
        }
        return onPointerMove(e)
      }
      if (mode.kind === 'pan') {
        st.camera = pan(st.camera, sx - mode.lastX, sy - mode.lastY, st.view, maze.width, maze.height)
        mode.lastX = sx
        mode.lastY = sy
        canvas.style.cursor = 'grabbing'
        return
      }
      const cell = cellUnder(sx, sy)
      if (cell < 0 || cell === mode.lastCell) return
      // Fill the cells a fast drag skipped, without pathing through the unknown.
      const segment = session.traceTo(cell, mode.lastCell)
      if (!segment) return
      st.route.push(...segment)
      mode.lastCell = cell
    }

    const onPointerUp = (e: PointerEvent): void => {
      const [sx, sy] = local(e)
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      if (e.pointerType === 'touch') return onTouchUp(e, sx, sy)
      const mode = st.pointer
      st.pointer = null
      canvas.style.cursor = ''
      if (mode?.kind !== 'pending' || !inputEnabledRef.current) return
      // Only a route back over cells already walked; clicking ahead is one step at most.
      const route = session.routeTo(cellUnder(sx, sy))
      if (route) {
        st.buffered = null
        st.route = route
      }
    }

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (!inputEnabledRef.current) return
      const [sx, sy] = local(e)
      const factor = Math.exp(-e.deltaY * 0.0015)
      st.camera = zoomAt(st.camera, factor, sx, sy, st.view, maze.width, maze.height)
    }

    const onContextMenu = (e: MouseEvent): void => e.preventDefault()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [session, steerTo])

  return (
    <div ref={containerRef} className="game-canvas">
      <canvas ref={canvasRef} />
      {touch && appearance.touchDpad && (
        <Dpad onSteer={steerTo} disabled={!inputEnabled || session.awaitingStart || session.finished} />
      )}
    </div>
  )
}
