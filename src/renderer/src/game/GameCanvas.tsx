import { useEffect, useRef } from 'react'
import type { Appearance, Palette } from '../../../core/appearance'
import { cellAt, cellX, cellY, type Direction } from '../../../core/maze'
import type { GameSession } from '../../../core/session'
import { fitCamera, followPoint, pan, screenToCell, zoomAt, type Camera, type Viewport } from './camera'
import { drawScene } from './draw'

/** Duration of the tween between two cells for keyboard steps. */
const STEP_MS = 90
/** Mouse routes can be long, so they are walked faster. */
const ROUTE_STEP_MS = 45
/** How long a key must be held before it starts auto-repeating steps. */
const HOLD_DELAY_MS = 180
/** Pointer travel (px) that turns a click into a drag. */
const DRAG_THRESHOLD = 4

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

export function GameCanvas({ session, inputEnabled, fitRequest, breadcrumbs, appearance, palette }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputEnabledRef = useRef(inputEnabled)
  inputEnabledRef.current = inputEnabled
  const breadcrumbsRef = useRef(breadcrumbs)
  breadcrumbsRef.current = breadcrumbs
  const appearanceRef = useRef({ appearance, palette })
  appearanceRef.current = { appearance, palette }

  // Mutable game-loop state lives in a ref so per-frame updates never re-render React.
  const state = useRef({
    view: { width: 0, height: 0 } as Viewport,
    camera: { scale: 1, x: 0, y: 0, fit: true } as Camera,
    anim: { from: session.player, to: session.player, start: 0, duration: STEP_MS },
    route: [] as number[],
    buffered: null as Direction | null,
    held: new Map<Direction, number>(),
    pointer: null as PointerMode | null
  })

  const refit = (): void => {
    const st = state.current
    st.camera = fitCamera(st.view, session.maze.width, session.maze.height)
  }

  // Reset per-maze state whenever a new session starts.
  useEffect(() => {
    const st = state.current
    st.anim = { from: session.player, to: session.player, start: 0, duration: STEP_MS }
    st.route = []
    st.buffered = null
    st.pointer = null
    refit()
  }, [session])

  useEffect(() => {
    if (fitRequest > 0) refit()
  }, [fitRequest])

  useEffect(() => {
    if (!inputEnabled) {
      state.current.held.clear()
      state.current.route = []
      state.current.pointer = null
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
      if (st.camera.fit) refit()
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
      if (heldDir && session.move(heldDir, now)) moved()
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

    const onPointerDown = (e: PointerEvent): void => {
      if (!inputEnabledRef.current) return
      const [sx, sy] = local(e)
      canvas.setPointerCapture(e.pointerId)
      if (e.button === 0) {
        const onPlayer = cellUnder(sx, sy) === session.player
        st.pointer = { kind: 'pending', startX: sx, startY: sy, lastX: sx, lastY: sy, onPlayer }
      } else {
        st.pointer = { kind: 'pan', lastX: sx, lastY: sy }
      }
    }

    const onPointerMove = (e: PointerEvent): void => {
      const mode = st.pointer
      if (!mode) return
      const [sx, sy] = local(e)
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
      const mode = st.pointer
      st.pointer = null
      canvas.style.cursor = ''
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      if (mode?.kind !== 'pending' || !inputEnabledRef.current) return
      const [sx, sy] = local(e)
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
  }, [session])

  return (
    <div ref={containerRef} className="game-canvas">
      <canvas ref={canvasRef} />
    </div>
  )
}
