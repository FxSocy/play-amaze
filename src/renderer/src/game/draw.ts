import type { DotShape, MazeStyleId, Palette } from '../../../core/appearance'
import { DIRECTIONS, DIRECTION_LIST, WALL_E, WALL_N, WALL_S, WALL_W, type Direction } from '../../../core/maze'
import type { GameSession } from '../../../core/session'
import type { Camera, Viewport } from './camera'

export interface Scene {
  session: GameSession
  camera: Camera
  view: Viewport
  /** Player position in cell units (fractional while animating). */
  playerX: number
  playerY: number
  /** Cells still queued for mouse-driven movement. */
  route: readonly number[]
  /** Draw breadcrumbs along passages the player has already walked. */
  showTrail: boolean
  style: MazeStyleId
  dotShape: DotShape
  now: number
}

/** How each maze style draws walls and cell markers. */
interface StyleSpec {
  wallWidth: (s: number) => number
  cap: CanvasLineCap
  join: CanvasLineJoin
  /** Snap geometry to whole pixels for a blocky look. */
  pixel: boolean
  /** Blur radius (relative to cell size) for glowing walls, markers and the player. */
  glow: number
  /** Corner radius of the start/exit markers, relative to cell size. */
  markerRadius: number
}

const STYLES: Record<MazeStyleId, StyleSpec> = {
  classic: { wallWidth: (s) => Math.max(1, s * 0.1), cap: 'square', join: 'miter', pixel: false, glow: 0, markerRadius: 0.15 },
  retro: { wallWidth: (s) => Math.max(2, Math.round(s * 0.22)), cap: 'square', join: 'miter', pixel: true, glow: 0, markerRadius: 0 },
  neon: { wallWidth: (s) => Math.max(1.5, s * 0.09), cap: 'round', join: 'round', pixel: false, glow: 0.45, markerRadius: 0.2 },
  blueprint: { wallWidth: (s) => Math.max(1, s * 0.06), cap: 'round', join: 'round', pixel: false, glow: 0, markerRadius: 0.05 },
  sketch: { wallWidth: (s) => Math.max(1, s * 0.07), cap: 'round', join: 'round', pixel: false, glow: 0, markerRadius: 0.3 },
  hedge: { wallWidth: (s) => Math.max(2, s * 0.38), cap: 'round', join: 'round', pixel: false, glow: 0, markerRadius: 0.5 }
}

/** Deterministic pseudo-random value in [-1, 1) for a point, so sketch strokes don't shimmer between frames. */
function jitter(a: number, b: number, salt: number): number {
  let h = Math.imul(a * 73856093 ^ b * 19349663 ^ salt * 83492791, 0x5bd1e995)
  h ^= h >>> 15
  return ((h >>> 0) % 2000) / 1000 - 1
}

/** Traces a dot shape of nominal radius `r` centred on (cx, cy) into the current path. */
function traceDot(ctx: CanvasRenderingContext2D, shape: DotShape, cx: number, cy: number, r: number): void {
  const polygon = (points: number, radius: number, rotation: number, inner?: number): void => {
    const steps = inner === undefined ? points : points * 2
    for (let i = 0; i < steps; i++) {
      const rad = inner !== undefined && i % 2 === 1 ? inner : radius
      const angle = rotation + (i * Math.PI * 2) / steps
      const x = cx + Math.cos(angle) * rad
      const y = cy + Math.sin(angle) * rad
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  switch (shape) {
    case 'circle':
    case 'ring':
      ctx.arc(cx, cy, shape === 'ring' ? r * 0.8 : r, 0, Math.PI * 2)
      return
    case 'square':
      ctx.roundRect(cx - r * 0.88, cy - r * 0.88, r * 1.76, r * 1.76, r * 0.25)
      return
    case 'diamond':
      polygon(4, r * 1.2, -Math.PI / 2)
      return
    case 'triangle':
      polygon(3, r * 1.25, -Math.PI / 2)
      return
    case 'star':
      polygon(5, r * 1.3, -Math.PI / 2, r * 0.55)
      return
    case 'hexagon':
      polygon(6, r * 1.08, 0)
      return
    case 'heart': {
      const k = r * 1.05
      const top = cy - k * 0.35
      ctx.moveTo(cx, cy + k * 0.95)
      ctx.bezierCurveTo(cx - k * 1.5, cy - k * 0.05, cx - k * 0.75, cy - k * 1.25, cx, top)
      ctx.bezierCurveTo(cx + k * 0.75, cy - k * 1.25, cx + k * 1.5, cy - k * 0.05, cx, cy + k * 0.95)
      ctx.closePath()
      return
    }
  }
}

/** Draws the player dot. Exported so settings can preview shapes exactly as they appear in game. */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  shape: DotShape,
  cx: number,
  cy: number,
  r: number,
  color: string,
  glow = 0
): void {
  ctx.save()
  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur = glow
  }
  ctx.beginPath()
  // Triangles look off-centre when their circumcentre is centred.
  traceDot(ctx, shape, cx, shape === 'triangle' ? cy + r * 0.18 : cy, r)
  if (shape === 'ring') {
    ctx.strokeStyle = color
    ctx.lineWidth = r * 0.45
    ctx.stroke()
  } else {
    ctx.fillStyle = color
    ctx.fill()
  }
  ctx.restore()
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, palette: Palette): void {
  const { session, camera: cam, view, now } = scene
  const { maze, explored, visible } = session
  const { width: w, height: h, walls } = maze
  const s = cam.scale
  const fog = session.fogEnabled
  const style = STYLES[scene.style]
  const snap = style.pixel ? Math.round : (v: number): number => v

  ctx.fillStyle = palette.canvasBg
  ctx.fillRect(0, 0, view.width, view.height)

  // Only iterate cells that intersect the viewport.
  const x0 = Math.max(0, Math.floor(-cam.x / s))
  const x1 = Math.min(w - 1, Math.floor((view.width - cam.x) / s))
  const y0 = Math.max(0, Math.floor(-cam.y / s))
  const y1 = Math.min(h - 1, Math.floor((view.height - cam.y) / s))
  const px = (x: number): number => snap(cam.x + x * s)
  const py = (y: number): number => snap(cam.y + y * s)

  if (session.awaitingStart) {
    // Only the maze's outline until the run starts, so nothing can be planned ahead.
    ctx.fillStyle = palette.fog
    ctx.fillRect(cam.x, cam.y, w * s, h * s)
    return
  }

  ctx.fillStyle = fog ? palette.fog : palette.floor
  ctx.fillRect(cam.x, cam.y, w * s, h * s)

  if (fog) {
    const seenFloor = new Path2D()
    const visibleFloor = new Path2D()
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        if (!explored[i]) continue
        // Slight overlap avoids hairline seams between adjacent cells.
        ;(visible[i] ? visibleFloor : seenFloor).rect(px(x), py(y), s + 0.5, s + 0.5)
      }
    }
    ctx.fillStyle = palette.floorSeen
    ctx.fill(seenFloor)
    ctx.fillStyle = palette.floor
    ctx.fill(visibleFloor)
  }

  if (scene.style === 'blueprint') drawGrid(ctx, palette, px, py, x0, x1, y0, y1, s)

  const center = (cell: number): [number, number] => [px((cell % w) + 0.5), py(Math.floor(cell / w) + 0.5)]

  const markCell = (cell: number, color: string, force = false): void => {
    if (!explored[cell] && !force) return
    const inset = s * 0.18
    const x = cell % w
    const y = Math.floor(cell / w)
    ctx.save()
    if (style.glow > 0) {
      ctx.shadowColor = color
      ctx.shadowBlur = s * style.glow
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(px(x) + inset, py(y) + inset, s - inset * 2, s - inset * 2, (s - inset * 2) * style.markerRadius)
    ctx.fill()
    ctx.restore()
  }
  markCell(maze.start, palette.start)
  markCell(maze.end, palette.exit)

  // The Daily Doozie flashes its exit as the run starts, so the player knows
  // roughly where to head without the fog giving the route away.
  const peek = session.exitPeekRemaining(now)
  if (peek > 0 && !explored[maze.end]) {
    const [ex, ey] = center(maze.end)
    ctx.save()
    // Fade out over the last moments rather than blinking off.
    ctx.globalAlpha = Math.min(1, peek / 700)
    markCell(maze.end, palette.exit, true)
    // A ring pulsing outwards reads as a beacon at a distance, where the marker
    // itself is only a few pixels across.
    const pulse = (now / 900) % 1
    ctx.globalAlpha *= 1 - pulse
    ctx.strokeStyle = palette.exit
    ctx.lineWidth = Math.max(1.5, s * 0.1)
    ctx.beginPath()
    ctx.arc(ex, ey, Math.max(4, s * 0.4) + pulse * Math.max(16, s * 1.2), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // Walls, in cell units: N and W for each revealed cell, plus S / E where no
  // revealed neighbour will draw that shared edge, so each segment appears once.
  const visibleWalls: number[] = []
  const seenWalls: number[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x
      if (!explored[i]) continue
      const segs = visible[i] ? visibleWalls : seenWalls
      const bits = walls[i]
      if (bits & WALL_N) segs.push(x, y, x + 1, y)
      if (bits & WALL_W) segs.push(x, y, x, y + 1)
      if (bits & WALL_S && (y === h - 1 || !explored[i + w])) segs.push(x, y + 1, x + 1, y + 1)
      if (bits & WALL_E && (x === w - 1 || !explored[i + 1])) segs.push(x + 1, y, x + 1, y + 1)
    }
  }
  const stroke = (segs: number[], color: string, glow: boolean): void =>
    strokeWalls(ctx, scene.style, style, segs, color, palette, px, py, s, glow)
  stroke(seenWalls, palette.wallSeen, false)
  stroke(visibleWalls, palette.wall, true)

  if (session.features) {
    drawFeatures(ctx, scene, palette, style, px, py, s, x0, x1, y0, y1)
  }

  if (scene.showTrail) {
    // Each passage is stored on both cells; draw it once from its west/north cell.
    // Start one cell before the viewport so passages crossing its edge are included.
    const trail = new Path2D()
    for (let y = Math.max(0, y0 - 1); y <= y1; y++) {
      for (let x = Math.max(0, x0 - 1); x <= x1; x++) {
        const bits = session.trail[y * w + x]
        if (!bits) continue
        const cx = px(x + 0.5)
        const cy = py(y + 0.5)
        if (bits & WALL_E) {
          trail.moveTo(cx, cy)
          trail.lineTo(px(x + 1.5), cy)
        }
        if (bits & WALL_S) {
          trail.moveTo(cx, cy)
          trail.lineTo(cx, py(y + 1.5))
        }
      }
    }
    ctx.strokeStyle = palette.trail
    ctx.lineWidth = Math.max(1.5, s * 0.16)
    ctx.lineCap = style.pixel ? 'square' : 'round'
    ctx.lineJoin = style.pixel ? 'miter' : 'round'
    ctx.stroke(trail)
  }

  if (session.solution && session.solution.length > 1) {
    ctx.strokeStyle = palette.solution
    ctx.lineWidth = Math.max(1.5, s * 0.14)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash([Math.max(3, s * 0.25), Math.max(3, s * 0.2)])
    ctx.beginPath()
    let pen = session.solution[0]
    ctx.moveTo(...center(pen))
    for (const cell of session.solution.slice(1)) {
      // A portal jump is not a walk between two cells, so the route lifts off
      // rather than drawing a line straight across the maze.
      if (adjacent(w, pen, cell)) ctx.lineTo(...center(cell))
      else ctx.moveTo(...center(cell))
      pen = cell
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  const hint = session.activeHint(now)
  if (hint) {
    const fade = Math.min(1, (hint.expiresAt - now) / 600)
    ctx.globalAlpha = fade
    ctx.fillStyle = palette.hint
    hint.path.slice(1).forEach((cell, step) => {
      const [cx, cy] = center(cell)
      const radius = Math.max(1.5, s * (0.16 - step * 0.007))
      ctx.beginPath()
      if (style.pixel) ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2)
      else ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1
  }

  const playerX = px(scene.playerX + 0.5)
  const playerY = py(scene.playerY + 0.5)

  if (scene.route.length > 0) {
    ctx.strokeStyle = palette.route
    ctx.lineWidth = Math.max(1.5, s * 0.12)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(playerX, playerY)
    for (const cell of scene.route) ctx.lineTo(...center(cell))
    ctx.stroke()
  }

  drawDot(ctx, scene.dotShape, playerX, playerY, Math.max(2.5, s * 0.3), palette.player, s * style.glow)

  if (scene.style === 'retro') drawScanlines(ctx, cam, view, w * s, h * s)
}

/** Whether two cells share an edge, which a portal jump's endpoints do not. */
function adjacent(width: number, a: number, b: number): boolean {
  const dx = Math.abs((a % width) - (b % width))
  const dy = Math.abs(Math.floor(a / width) - Math.floor(b / width))
  return dx + dy === 1 && (dx === 0 || dy === 0)
}

/**
 * Arcade features, drawn over the floor and under the player: portals, keys,
 * gates and the chevrons that mark a one-way door.
 *
 * Colours come from the theme the player already chose, so every theme gets a
 * readable Arcade maze: the two portal pairs borrow the accent and Doozie
 * colours, keys the hint colour and a locked gate the danger colour. Charges
 * are the exception and carry a colour of their own — `success` sits right on
 * top of `exit` in several themes, and a second green marker would read as a
 * second way out.
 */
function drawFeatures(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: Palette,
  style: StyleSpec,
  px: (x: number) => number,
  py: (y: number) => number,
  s: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
): void {
  const { session } = scene
  const features = session.features!
  const w = session.maze.width
  const pairColor = (cell: number): string => {
    const index = features.portalPairs.findIndex(([a, b]) => a === cell || b === cell)
    return index % 2 === 0 ? palette.accent : palette.doozie
  }

  ctx.save()
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cell = y * w + x
      if (!session.explored[cell]) continue
      const cx = px(x + 0.5)
      const cy = py(y + 0.5)
      const glow = style.glow > 0 ? s * style.glow : 0

      if (features.portals[cell] >= 0) {
        drawPortal(ctx, cx, cy, s, pairColor(cell), glow)
      }
      if (session.keyAt(cell)) {
        drawKey(ctx, cx, cy, s, palette.hint, glow)
      }
      if (session.boxAt(cell)) {
        drawMysteryBox(ctx, cx, cy, s, palette.charge, glow)
      }
      const gate = session.gateAt(cell)
      if (gate) {
        drawGate(ctx, cx, cy, s, gate === 'locked' ? palette.danger : palette.wallSeen, gate === 'open')
      }
      const doors = features.oneWay[cell]
      if (doors) {
        for (const dir of DIRECTION_LIST) {
          if (doors & DIRECTIONS[dir].wall) drawOneWay(ctx, px(x), py(y), s, dir, palette.route)
        }
      }
    }
  }
  ctx.restore()
}

/** Two rings, like something you could step into. */
function drawPortal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
  glow: number
): void {
  ctx.save()
  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur = glow
  }
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, s * 0.09)
  ctx.beginPath()
  ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** A key: a ring with a toothed stem. */
function drawKey(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
  glow: number
): void {
  const r = s * 0.13
  ctx.save()
  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur = glow
  }
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, s * 0.08)
  ctx.beginPath()
  ctx.arc(cx - r, cy - r * 0.2, r, 0, Math.PI * 2)
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + r * 1.9, cy + r * 1.5)
  ctx.moveTo(cx + r * 1.1, cy + r * 0.7)
  ctx.lineTo(cx + r * 1.7, cy + r * 0.1)
  ctx.stroke()
  ctx.restore()
}

/** A mystery box: a boxed question mark, waiting at the end of some branch. */
function drawMysteryBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
  glow: number
): void {
  const half = s * 0.3
  ctx.save()
  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur = glow
  }
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, s * 0.08)
  ctx.beginPath()
  ctx.roundRect(cx - half, cy - half, half * 2, half * 2, half * 0.35)
  ctx.stroke()
  // Below about ten pixels a question mark is a smudge; the box alone still reads.
  if (s >= 10) {
    ctx.shadowBlur = 0
    ctx.fillStyle = color
    ctx.font = `bold ${Math.round(s * 0.5)}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', cx, cy + s * 0.03)
  }
  ctx.restore()
}

/** A barred gate; once unlocked it fades to a frame the player can walk through. */
function drawGate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
  open: boolean
): void {
  const half = s * 0.3
  ctx.save()
  ctx.globalAlpha = open ? 0.3 : 1
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, s * 0.08)
  ctx.beginPath()
  ctx.rect(cx - half, cy - half, half * 2, half * 2)
  if (!open) {
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(cx + i * half * 0.6, cy - half)
      ctx.lineTo(cx + i * half * 0.6, cy + half)
    }
  }
  ctx.stroke()
  ctx.restore()
}

/** A chevron on the passage edge, pointing the only way through it. */
function drawOneWay(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  s: number,
  blocked: Direction,
  color: string
): void {
  // `blocked` is the way the player may not leave, so travel points the other way.
  const { dx, dy } = DIRECTIONS[blocked]
  const edgeX = left + s * (0.5 + dx * 0.5)
  const edgeY = top + s * (0.5 + dy * 0.5)
  const size = s * 0.18
  // Into the cell, away from the edge.
  const angle = Math.atan2(-dy, -dx)
  ctx.save()
  ctx.translate(edgeX + dx * size * -0.3, edgeY + dy * size * -0.3)
  ctx.rotate(angle)
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, s * 0.08)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(-size * 0.5, -size * 0.7)
  ctx.lineTo(size * 0.45, 0)
  ctx.lineTo(-size * 0.5, size * 0.7)
  ctx.stroke()
  ctx.restore()
}

function strokeWalls(
  ctx: CanvasRenderingContext2D,
  id: MazeStyleId,
  style: StyleSpec,
  segs: number[],
  color: string,
  palette: Palette,
  px: (x: number) => number,
  py: (y: number) => number,
  s: number,
  visible: boolean
): void {
  if (segs.length === 0) return
  const width = style.wallWidth(s)
  const path = new Path2D()

  if (id === 'sketch') {
    // Two slightly different wobbly strokes per wall, like a pencil going over a line twice.
    const wobble = s * 0.07
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < segs.length; i += 4) {
        const [ax, ay, bx, by] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]]
        const key = ax * 2 + bx + (ay * 2 + by) * 1024
        const j = (salt: number): number => jitter(key, pass, salt) * wobble
        path.moveTo(px(ax) + j(1), py(ay) + j(2))
        path.quadraticCurveTo(
          px((ax + bx) / 2) + j(3),
          py((ay + by) / 2) + j(4),
          px(bx) + j(5),
          py(by) + j(6)
        )
      }
    }
    ctx.save()
    ctx.globalAlpha = 0.8
    applyStroke(ctx, style, color, width)
    ctx.stroke(path)
    ctx.restore()
    return
  }

  for (let i = 0; i < segs.length; i += 4) {
    path.moveTo(px(segs[i]), py(segs[i + 1]))
    path.lineTo(px(segs[i + 2]), py(segs[i + 3]))
  }

  ctx.save()
  applyStroke(ctx, style, color, width)
  if (style.glow > 0 && visible) {
    ctx.shadowColor = color
    ctx.shadowBlur = s * style.glow
    ctx.stroke(path)
    // A thinner, unblurred core keeps the tube crisp inside its glow.
    ctx.shadowBlur = 0
    ctx.lineWidth = Math.max(1, width * 0.5)
    ctx.stroke(path)
  } else {
    ctx.stroke(path)
  }
  if (id === 'hedge') {
    // A soft highlight down the middle gives the hedges some volume.
    ctx.globalAlpha = 0.18
    ctx.strokeStyle = palette.floor
    ctx.lineWidth = width * 0.4
    ctx.stroke(path)
  }
  ctx.restore()
}

function applyStroke(ctx: CanvasRenderingContext2D, style: StyleSpec, color: string, width: number): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = style.cap
  ctx.lineJoin = style.join
}

/** Faint cell grid under the walls, like drafting paper. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  px: (x: number) => number,
  py: (y: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  s: number
): void {
  if (s < 6) return
  const grid = new Path2D()
  for (let x = x0; x <= x1 + 1; x++) {
    grid.moveTo(px(x), py(y0))
    grid.lineTo(px(x), py(y1 + 1))
  }
  for (let y = y0; y <= y1 + 1; y++) {
    grid.moveTo(px(x0), py(y))
    grid.lineTo(px(x1 + 1), py(y))
  }
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.strokeStyle = palette.wallSeen
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  ctx.stroke(grid)
  ctx.restore()
}

/** CRT-style horizontal scanlines over the maze. */
function drawScanlines(ctx: CanvasRenderingContext2D, cam: Camera, view: Viewport, mazeW: number, mazeH: number): void {
  const left = Math.max(0, Math.floor(cam.x))
  const right = Math.min(view.width, Math.ceil(cam.x + mazeW))
  const top = Math.max(0, Math.floor(cam.y))
  const bottom = Math.min(view.height, Math.ceil(cam.y + mazeH))
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
  for (let y = top; y < bottom; y += 3) ctx.fillRect(left, y, right - left, 1)
}
