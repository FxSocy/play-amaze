import { useEffect, useRef, type ReactNode } from 'react'
import type { Palette } from '../../../core/appearance'
import type { GameSession } from '../../../core/session'
import { drawGate, drawKey, drawMysteryBox, drawOneWay, drawPortal, paneColor } from '../game/draw'
import { useIsTouch } from '../theme'

const ICON = 34

/** A small canvas drawn with the maze's own drawing code, so the legend matches the game. */
function GuideIcon({ paint, palette }: { paint: (ctx: CanvasRenderingContext2D, palette: Palette) => void; palette: Palette }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const dpr = window.devicePixelRatio || 1
    canvas.width = ICON * dpr
    canvas.height = ICON * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = palette.floor
    ctx.beginPath()
    ctx.roundRect(0, 0, ICON, ICON, 7)
    ctx.fill()
    paint(ctx, palette)
  }, [paint, palette])
  return <canvas ref={ref} className="guide-icon" style={{ width: ICON, height: ICON }} aria-hidden="true" />
}

const C = ICON / 2

const paintPortal = (ctx: CanvasRenderingContext2D, palette: Palette): void =>
  drawPortal(ctx, C, C, ICON, paneColor(palette, 1), 0, 2)
const paintKey = (ctx: CanvasRenderingContext2D, palette: Palette): void => drawKey(ctx, C, C, ICON, palette.hint, 0)
const paintGate = (ctx: CanvasRenderingContext2D, palette: Palette): void =>
  drawGate(ctx, C, C, ICON, palette.danger, false)
const paintBox = (ctx: CanvasRenderingContext2D, palette: Palette): void =>
  drawMysteryBox(ctx, C, C, ICON, palette.charge, 0)
const paintOneWay = (ctx: CanvasRenderingContext2D, palette: Palette): void => {
  // A passage with its door on the left edge: walls above and below, and the
  // chevron pointing the one way through.
  ctx.strokeStyle = palette.wall
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(4, 8)
  ctx.lineTo(ICON - 4, 8)
  ctx.moveTo(4, ICON - 8)
  ctx.lineTo(ICON - 4, ICON - 8)
  ctx.stroke()
  drawOneWay(ctx, 0, 0, ICON, 'left', palette.route)
}
const paintSections = (ctx: CanvasRenderingContext2D, palette: Palette): void => {
  // Two stretches of corridor, and the wall that splits them.
  ctx.strokeStyle = palette.wallSeen
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(3, 10)
  ctx.lineTo(ICON - 3, 10)
  ctx.moveTo(3, ICON - 10)
  ctx.lineTo(ICON - 3, ICON - 10)
  ctx.stroke()
  ctx.strokeStyle = palette.danger
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(C, 10)
  ctx.lineTo(C, ICON - 10)
  ctx.stroke()
}
const paintMap = (ctx: CanvasRenderingContext2D, palette: Palette): void => {
  // Two thumbnails, the first outlined as the one on screen.
  for (const pane of [0, 1]) {
    const x = 4 + pane * 14
    ctx.strokeStyle = pane === 0 ? paneColor(palette, 0) : palette.wallSeen
    ctx.lineWidth = pane === 0 ? 2 : 1.2
    ctx.strokeRect(x, 10, 12, 14)
    ctx.fillStyle = paneColor(palette, pane === 0 ? 1 : 0)
    ctx.beginPath()
    ctx.arc(x + 6, 17, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = palette.player
  ctx.beginPath()
  ctx.arc(8, 21, 2.2, 0, Math.PI * 2)
  ctx.fill()
}
const paintScore = (ctx: CanvasRenderingContext2D, palette: Palette): void => {
  ctx.fillStyle = palette.exit
  ctx.beginPath()
  ctx.roundRect(8, 8, ICON - 16, ICON - 16, 4)
  ctx.fill()
}

function Item({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="guide-item">
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  )
}

/**
 * Everything about Portal, in one place: shown on the Daily Portal's start
 * screen before the clock runs, and from the menu during any Portal game.
 * Counts come from the session, so it describes the game actually being played.
 */
export function PortalGuide({ session, palette }: { session: GameSession; palette: Palette }) {
  const touch = useIsTouch()
  const layout = session.layout
  const features = session.features
  if (!layout || !features) return null
  const n = layout.panes
  const last = n
  const gates = features.gateCells.length
  const boxes = features.boxCells.length
  const example = n === 2 ? '1 → 2 → 1 → 2' : n === 3 ? '1 → 3 → 1 → 2 → 3' : '1 → 3 → 2 → 1 → 4'
  const look = touch ? 'Tap a thumbnail' : `Click a thumbnail (or press 1–${n})`

  return (
    <div className="portal-guide">
      <p className="guide-lead">
        <strong>{n} mazes, linked by portals.</strong> You start in <Pane n={1} palette={palette} /> and the exit is in{' '}
        <Pane n={last} palette={palette} />. But no maze is in one piece: each is cut into walled-off{' '}
        <em>sections</em>, and the only way out of a section is a portal to another maze. So the way through
        bounces back and forth between them, something like {example}.
      </p>
      <ul className="guide-list">
        <Item icon={<GuideIcon paint={paintPortal} palette={palette} />} title="Portals">
          A ring with a number leads to that maze, and it's drawn in that maze's colour. Step onto it and you come
          out of its partner portal over there; step onto the partner to come back. Every portal works both ways,
          and a trip through one counts as a single move. Some portals lead on towards the exit, and some lead to
          dead-end sections that hold keys and boxes.
        </Item>
        <Item icon={<GuideIcon paint={paintSections} palette={palette} />} title="Sections">
          You only see the maze you're in. If a corridor you want seems sealed off, it is: look for a portal in your
          section instead. Every section can be reached, and nothing in the game can strand you.
        </Item>
        <Item icon={<GuideIcon paint={paintMap} palette={palette} />} title="The map">
          The strip in the top-left corner shows every maze. The outlined one is on screen, your dot shows where you
          are, and the coloured specks are portals. {look} to look at another maze and plan ahead; move and the view
          comes back to you.
        </Item>
        {gates > 0 && (
          <Item icon={<GuideIcon paint={paintGate} palette={palette} />} title={`${gates} locked gate${gates === 1 ? '' : 's'}`}>
            Barred gates stand on the way to the exit, with no way around them. Walk into one while holding a key to
            open it for good. The Keys count in the header shows what you're carrying.
          </Item>
        )}
        {gates > 0 && (
          <Item icon={<GuideIcon paint={paintKey} palette={palette} />} title="Keys work in every maze">
            A key picked up in one maze opens a gate in any maze. Every key can be reached before the first gate, but
            often only through a portal, so fetching one is a trip of its own.
          </Item>
        )}
        <Item icon={<GuideIcon paint={paintOneWay} palette={palette} />} title="One-way doors">
          The chevron points the only way through. They sit on the run home, after the last gate, so going through
          one never leaves anything you still need behind it.
        </Item>
        {boxes > 0 && (
          <Item icon={<GuideIcon paint={paintBox} palette={palette} />} title={`${boxes} ? boxes`}>
            Each sits at a dead end, so reaching one is a detour you choose. Opening it stops the clock and spins
            for one of four things: a wall-break charge ({touch ? 'Menu → Break a wall' : 'X, then walk into a wall'}),
            a jump over one wall ({touch ? 'Menu → Jump a wall' : 'Z'}), the lights going out for a few seconds, or a
            trip back to the start in Maze 1. What's inside is different every run. A charge or a jump works on any
            wall inside a maze, even one that splits two sections, but never through a maze's outer edge: portals
            are the only way between mazes.
          </Item>
        )}
        <Item icon={<GuideIcon paint={paintScore} palette={palette} />} title="Finishing and scoring">
          Reach the exit square in Maze {last}. Points are seconds × moves, the same as every daily, and lower is
          better. Hints and give-up routes plan through portals, keys and gates exactly as you would walk them.
        </Item>
      </ul>
    </div>
  )
}

/** "Maze 2", in that maze's colour. */
function Pane({ n, palette }: { n: number; palette: Palette }) {
  return (
    <strong className="guide-pane" style={{ color: paneColor(palette, n - 1) }}>
      Maze {n}
    </strong>
  )
}
