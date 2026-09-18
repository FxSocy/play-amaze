/** Maps maze cell coordinates to canvas CSS pixels: screen = cell * scale + offset. */
export interface Camera {
  scale: number
  x: number
  y: number
  /** When true the camera re-fits the whole maze on resize. */
  fit: boolean
}

export interface Viewport {
  width: number
  height: number
}

const PADDING = 24
export const MAX_SCALE = 96
/**
 * Cells smaller than this are hard to tap and hard to read. Fitting a 30x20
 * maze to a phone gives roughly 11px cells, so touch devices start zoomed in on
 * the player instead of fitting the whole maze; Fit still fits.
 */
export const MIN_TOUCH_SCALE = 28

export function fitScale(view: Viewport, mazeW: number, mazeH: number): number {
  const scale = Math.min((view.width - PADDING * 2) / mazeW, (view.height - PADDING * 2) / mazeH)
  return Math.max(1, Math.min(MAX_SCALE, scale))
}

export function fitCamera(view: Viewport, mazeW: number, mazeH: number): Camera {
  const scale = fitScale(view, mazeW, mazeH)
  return {
    scale,
    x: (view.width - mazeW * scale) / 2,
    y: (view.height - mazeH * scale) / 2,
    fit: true
  }
}

/** Centres a cell at a given scale, clamped so the maze stays on screen. */
export function focusCamera(
  view: Viewport,
  mazeW: number,
  mazeH: number,
  cx: number,
  cy: number,
  scale: number
): Camera {
  const capped = Math.max(1, Math.min(MAX_SCALE, scale))
  return clampCamera(
    { scale: capped, x: view.width / 2 - cx * capped, y: view.height / 2 - cy * capped, fit: false },
    view,
    mazeW,
    mazeH
  )
}

/** Keeps at least part of the maze on screen so it can't be panned away and lost. */
export function clampCamera(cam: Camera, view: Viewport, mazeW: number, mazeH: number): Camera {
  const clampAxis = (offset: number, viewSize: number, mazeSize: number): number => {
    const lo = Math.min(PADDING, viewSize - mazeSize * cam.scale - PADDING)
    const hi = Math.max(PADDING, viewSize - mazeSize * cam.scale - PADDING)
    return Math.min(hi, Math.max(lo, offset))
  }
  return { ...cam, x: clampAxis(cam.x, view.width, mazeW), y: clampAxis(cam.y, view.height, mazeH) }
}

/** Zooms by `factor` keeping the point under (sx, sy) fixed. Snaps back to fit at minimum zoom. */
export function zoomAt(
  cam: Camera,
  factor: number,
  sx: number,
  sy: number,
  view: Viewport,
  mazeW: number,
  mazeH: number
): Camera {
  const minScale = fitScale(view, mazeW, mazeH)
  const scale = Math.min(MAX_SCALE, Math.max(minScale, cam.scale * factor))
  if (scale <= minScale * 1.001) return fitCamera(view, mazeW, mazeH)
  const ratio = scale / cam.scale
  const zoomed = { scale, x: sx - (sx - cam.x) * ratio, y: sy - (sy - cam.y) * ratio, fit: false }
  return clampCamera(zoomed, view, mazeW, mazeH)
}

export function pan(cam: Camera, dx: number, dy: number, view: Viewport, mazeW: number, mazeH: number): Camera {
  if (cam.fit) return cam
  return clampCamera({ ...cam, x: cam.x + dx, y: cam.y + dy }, view, mazeW, mazeH)
}

/** Nudges the camera so the point (cx, cy) in cell units stays away from the viewport edges. */
export function followPoint(cam: Camera, cx: number, cy: number, view: Viewport): Camera {
  if (cam.fit) return cam
  const margin = Math.min(view.width, view.height) * 0.2
  const sx = cx * cam.scale + cam.x
  const sy = cy * cam.scale + cam.y
  let { x, y } = cam
  if (sx < margin) x += margin - sx
  else if (sx > view.width - margin) x -= sx - (view.width - margin)
  if (sy < margin) y += margin - sy
  else if (sy > view.height - margin) y -= sy - (view.height - margin)
  return x === cam.x && y === cam.y ? cam : { ...cam, x, y }
}

export function screenToCell(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: Math.floor((sx - cam.x) / cam.scale), y: Math.floor((sy - cam.y) / cam.scale) }
}
