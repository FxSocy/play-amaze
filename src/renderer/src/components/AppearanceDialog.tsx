import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import {
  DEFAULT_APPEARANCE,
  DOT_COLOR_SWATCHES,
  DOT_SHAPE_IDS,
  DOT_SHAPES,
  MAZE_STYLE_IDS,
  MAZE_STYLES,
  resolvePalette,
  THEME_CHOICES,
  THEMES,
  type Appearance,
  type Palette,
  type ThemeChoice
} from '../../../core/appearance'
import { findPath } from '../../../core/solver'
import { GameSession } from '../../../core/session'
import { DEFAULT_SETTINGS } from '../../../core/settings'
import { drawDot, drawScene } from '../game/draw'
import { useIsTouch } from '../theme'
import { Dialog } from './Dialog'

interface Props {
  appearance: Appearance
  prefersDark: boolean
  /** Applied (and saved) immediately, so the whole app previews each change. */
  onChange: (appearance: Appearance) => void
  onClose: () => void
}

/** A canvas sized in CSS pixels that redraws at device resolution whenever `draw` changes. */
function Canvas({ width, height, draw, label }: { width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    draw(ctx)
  })
  return <canvas ref={ref} style={{ width, height }} role={label ? 'img' : undefined} aria-label={label} />
}

/** A small fixed maze with a few steps walked, so breadcrumbs, markers and the dot all show. */
function previewSession(width: number, height: number, steps: number): GameSession {
  const settings = { ...DEFAULT_SETTINGS, seedMode: 'random' as const, sizePreset: 'custom' as const, customWidth: width, customHeight: height, fog: 'off' as const }
  const session = new GameSession(settings, 'APPEARANCE-PREVIEW')
  const path = findPath(session.maze, session.player, session.maze.end) ?? []
  for (const cell of path.slice(1, steps + 1)) session.moveTo(cell, 0)
  return session
}

function MazePreview({ session, appearance, palette, width, height }: { session: GameSession; appearance: Appearance; palette: Palette; width: number; height: number }) {
  return (
    <Canvas
      width={width}
      height={height}
      draw={(ctx) => {
        const view = { width, height }
        // The game's fit leaves a wide margin for panning; previews fill their box instead.
        const pad = Math.min(width, height) * 0.08
        const scale = Math.min((width - pad * 2) / session.maze.width, (height - pad * 2) / session.maze.height)
        const camera = {
          scale,
          x: (width - session.maze.width * scale) / 2,
          y: (height - session.maze.height * scale) / 2,
          fit: true
        }
        const cell = session.player
        drawScene(
          ctx,
          {
            session,
            camera,
            view,
            playerX: cell % session.maze.width,
            playerY: Math.floor(cell / session.maze.width),
            route: [],
            showTrail: true,
            style: appearance.mazeStyle,
            dotShape: appearance.dotShape,
            now: 0
          },
          palette
        )
      }}
    />
  )
}

function ThemeSwatch({ choice, prefersDark }: { choice: ThemeChoice; prefersDark: boolean }) {
  const chip = (p: Palette): ReactElement => (
    <span className="theme-chip" style={{ background: p.bg, borderColor: p.border }}>
      <span style={{ background: p.wall }} />
      <span style={{ background: p.accent }} />
      <span style={{ background: p.player }} />
    </span>
  )
  if (choice !== 'system') return chip(THEMES[choice].palette)
  const [first, second] = prefersDark ? [THEMES.dark, THEMES.light] : [THEMES.light, THEMES.dark]
  return (
    <span className="theme-chip-pair">
      {chip(first.palette)}
      {chip(second.palette)}
    </span>
  )
}

export function AppearanceDialog({ appearance, prefersDark, onChange, onClose }: Props) {
  const touch = useIsTouch()
  const palette = resolvePalette(appearance, prefersDark)
  const update = (patch: Partial<Appearance>): void => onChange({ ...appearance, ...patch })
  const bigPreview = useMemo(() => previewSession(14, 6, 9), [])
  const tilePreview = useMemo(() => previewSession(7, 4, 4), [])
  const dotColor = appearance.dotColor ?? palette.player

  return (
    <Dialog title="Appearance" onClose={onClose} wide>
      <div className="appearance-preview" style={{ background: palette.canvasBg }}>
        <MazePreview session={bigPreview} appearance={appearance} palette={palette} width={560} height={180} />
      </div>

      <div className="field">
        <label>Theme</label>
        <div className="option-grid">
          {THEME_CHOICES.map((choice) => (
            <button
              key={choice}
              className={choice === appearance.theme ? 'option-card active' : 'option-card'}
              aria-pressed={choice === appearance.theme}
              onClick={() => update({ theme: choice })}
            >
              <ThemeSwatch choice={choice} prefersDark={prefersDark} />
              <span>{choice === 'system' ? 'System' : THEMES[choice].label}</span>
            </button>
          ))}
        </div>
        {appearance.theme === 'system' && <p className="help">Follows your OS light / dark setting.</p>}
      </div>

      <div className="field">
        <label>Maze style</label>
        <div className="option-grid">
          {MAZE_STYLE_IDS.map((id) => (
            <button
              key={id}
              className={id === appearance.mazeStyle ? 'option-card active' : 'option-card'}
              aria-pressed={id === appearance.mazeStyle}
              onClick={() => update({ mazeStyle: id })}
              title={MAZE_STYLES[id].description}
            >
              <span className="style-thumb" style={{ background: palette.canvasBg }}>
                <MazePreview
                  session={tilePreview}
                  appearance={{ ...appearance, mazeStyle: id }}
                  palette={palette}
                  width={120}
                  height={68}
                />
              </span>
              <span>{MAZE_STYLES[id].label}</span>
            </button>
          ))}
        </div>
        <p className="help">{MAZE_STYLES[appearance.mazeStyle].description}</p>
      </div>

      <div className="field">
        <label>Dot shape</label>
        <div className="dot-row">
          {DOT_SHAPE_IDS.map((shape) => (
            <button
              key={shape}
              className={shape === appearance.dotShape ? 'dot-option active' : 'dot-option'}
              aria-pressed={shape === appearance.dotShape}
              onClick={() => update({ dotShape: shape })}
              title={DOT_SHAPES[shape].label}
            >
              <Canvas
                width={32}
                height={32}
                label={DOT_SHAPES[shape].label}
                draw={(ctx) => drawDot(ctx, shape, 16, 16, 9, dotColor)}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Dot colour</label>
        <div className="dot-row">
          <button
            className={appearance.dotColor === null ? 'color-option theme active' : 'color-option theme'}
            aria-pressed={appearance.dotColor === null}
            onClick={() => update({ dotColor: null })}
            title="Use the theme's colour"
          >
            <span className="swatch" style={{ background: resolvePalette({ ...appearance, dotColor: null }, prefersDark).player }} />
            Theme
          </button>
          {DOT_COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              className={appearance.dotColor === color ? 'color-option active' : 'color-option'}
              aria-pressed={appearance.dotColor === color}
              aria-label={color}
              title={color}
              onClick={() => update({ dotColor: color })}
            >
              <span className="swatch" style={{ background: color }} />
            </button>
          ))}
          <label className="color-option custom" title="Pick any colour">
            <input
              type="color"
              value={dotColor}
              onChange={(e) => update({ dotColor: e.target.value.toLowerCase() })}
            />
            Custom
          </label>
        </div>
      </div>

      {touch && (
        <div className="field">
          <label>Touch controls</label>
          <div className="segmented">
            <button
              className={appearance.touchDpad ? 'active' : ''}
              aria-pressed={appearance.touchDpad}
              onClick={() => update({ touchDpad: true })}
            >
              Direction pad
            </button>
            <button
              className={appearance.touchDpad ? '' : 'active'}
              aria-pressed={!appearance.touchDpad}
              onClick={() => update({ touchDpad: false })}
            >
              Drag to move
            </button>
          </div>
          <p className="help">
            {appearance.touchDpad
              ? 'Arrow buttons sit in the corner of the maze. Dragging still works too.'
              : 'Drag anywhere on the maze to move; hold to keep going.'}
          </p>
        </div>
      )}

      <footer className="dialog-footer">
        <div className="footer-left">
          <button className="btn btn-ghost" onClick={() => onChange({ ...DEFAULT_APPEARANCE })}>
            Reset to defaults
          </button>
        </div>
        <div className="footer-right">
          <span className="help">Changes save automatically</span>
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            Done
          </button>
        </div>
      </footer>
    </Dialog>
  )
}
