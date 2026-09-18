interface Props {
  onDismiss: () => void
  /** Turns the direction pad on and dismisses, for players who would rather not drag. */
  onUseDpad: () => void
}

/**
 * Shown once on a touch device: the controls are gestures, and gestures are
 * invisible. Dismissing it is remembered, so it never interrupts twice.
 */
export function TouchHint({ onDismiss, onUseDpad }: Props) {
  return (
    <div className="touch-hint" role="dialog" aria-label="Touch controls">
      <h3>Playing by touch</h3>
      <ul>
        <li>
          <b>Drag</b> anywhere to move — hold to keep going, turn as you drag
        </li>
        <li>
          <b>Tap</b> a cell you have already walked to go back there
        </li>
        <li>
          <b>Two fingers</b> to move the maze, <b>pinch</b> to zoom
        </li>
      </ul>
      <div className="touch-hint-actions">
        <button className="btn btn-primary" onClick={onDismiss}>
          Got it
        </button>
        <button className="btn btn-ghost" onClick={onUseDpad}>
          Use a D-pad instead
        </button>
      </div>
    </div>
  )
}
