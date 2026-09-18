import type { Direction } from '../../../core/maze'

interface Props {
  /** Steers while held, exactly like a held arrow key; null stops. */
  onSteer: (direction: Direction | null) => void
  disabled: boolean
}

const KEYS: { direction: Direction; glyph: string; label: string }[] = [
  { direction: 'up', glyph: '▲', label: 'Move up' },
  { direction: 'left', glyph: '◀', label: 'Move left' },
  { direction: 'right', glyph: '▶', label: 'Move right' },
  { direction: 'down', glyph: '▼', label: 'Move down' }
]

/**
 * An explicit direction pad for players who would rather press a button than
 * drag. It sits above the canvas, so its own pointer events never reach the
 * maze, and it steers through the same path as every other input.
 */
export function Dpad({ onSteer, disabled }: Props) {
  return (
    <div className="dpad" role="group" aria-label="Direction pad">
      {KEYS.map(({ direction, glyph, label }) => (
        <button
          key={direction}
          className={`dpad-key dpad-${direction}`}
          aria-label={label}
          disabled={disabled}
          onPointerDown={(e) => {
            // Keeps the press from becoming a click, a scroll or a text selection.
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            onSteer(direction)
          }}
          onPointerUp={() => onSteer(null)}
          onPointerCancel={() => onSteer(null)}
          onLostPointerCapture={() => onSteer(null)}
        >
          <span aria-hidden="true">{glyph}</span>
        </button>
      ))}
    </div>
  )
}
