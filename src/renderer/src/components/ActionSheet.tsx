import { useEffect, type ReactNode } from 'react'

export interface SheetAction {
  key: string
  label: string
  title: string
  onClick: () => void
  disabled?: boolean
  /** Rendered as a toggle that is currently on. */
  pressed?: boolean
  /** Extra text on the right of the row, e.g. a hint count. */
  detail?: string
  primary?: boolean
  danger?: boolean
  /** Starts a new group above this row. */
  separated?: boolean
}

interface Props {
  actions: SheetAction[]
  onClose: () => void
  children?: ReactNode
}

/**
 * The phone menu: everything that does not fit the compact header, as a sheet
 * from the bottom of the screen where a thumb can reach it. Rows are full width
 * and tall enough to hit without aiming.
 */
export function ActionSheet({ actions, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Stops the app's own Escape handler opening Settings behind the sheet.
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="sheet-handle" />
        {children}
        {actions.map((action) => (
          <button
            key={action.key}
            className={[
              'sheet-item',
              action.pressed ? 'active' : '',
              action.primary ? 'primary' : '',
              action.danger ? 'danger' : '',
              action.separated ? 'separated' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              action.onClick()
              onClose()
            }}
            disabled={action.disabled}
            aria-pressed={action.pressed}
            title={action.title}
          >
            <span>{action.label}</span>
            {(action.detail || action.pressed !== undefined) && (
              <span className="sheet-detail mono">{action.detail ?? (action.pressed ? 'On' : 'Off')}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
