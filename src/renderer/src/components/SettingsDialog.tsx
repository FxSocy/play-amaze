import { useState } from 'react'
import { ARCADE_LABELS, ARCADE_LEVELS, arcadeSpecFor } from '../../../core/arcade'
import { ALGORITHM_IDS, GENERATORS } from '../../../core/generators'
import {
  CUSTOM_SIZE_MAX,
  CUSTOM_SIZE_MIN,
  FOG_LEVEL_IDS,
  FOG_LEVELS,
  HINT_OPTIONS,
  resolveSize,
  sanitizeSettings,
  SIZE_PRESET_IDS,
  SIZE_PRESETS,
  type GameSettings
} from '../../../core/settings'
import { Dialog } from './Dialog'

interface Props {
  settings: GameSettings
  hasSavedDefaults: boolean
  onStart: (settings: GameSettings) => void
  onSaveDefaults: (settings: GameSettings) => Promise<void>
  onClearDefaults: () => Promise<void>
  onClose: () => void
  /** Opened by picking Custom, so starting a maze is what the player came for. */
  autoStart?: boolean
}

interface SegmentedProps<T extends string | number> {
  value: T
  options: readonly T[]
  label: (option: T) => string
  onChange: (value: T) => void
}

function Segmented<T extends string | number>({ value, options, label, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={option === value}
          className={option === value ? 'active' : ''}
          onClick={() => onChange(option)}
        >
          {label(option)}
        </button>
      ))}
    </div>
  )
}

/**
 * Custom maze setup. The three daily mazes are standards nobody configures, so
 * everything here shapes a maze of the player's own — which is why picking
 * Custom in the header opens this rather than starting a run straight away.
 */
export function SettingsDialog({
  settings,
  hasSavedDefaults,
  onStart,
  onSaveDefaults,
  onClearDefaults,
  onClose,
  autoStart = false
}: Props) {
  const [draft, setDraft] = useState(settings)
  const [status, setStatus] = useState<string | null>(null)
  const size = resolveSize(draft)
  const spec = arcadeSpecFor(draft.arcade, size.width, size.height)
  const update = (patch: Partial<GameSettings>): void => {
    setDraft((d) => ({ ...d, ...patch }))
    setStatus(null)
  }

  const run = (task: Promise<void>, message: string): void => {
    task.then(
      () => setStatus(message),
      (err: unknown) => setStatus(`Failed: ${String(err)}`)
    )
  }

  return (
    <Dialog title="Custom maze" onClose={onClose}>
      <p className="help dialog-intro">
        A random maze with your own algorithm, size and modifiers. Best times are kept per
        combination, so a foggy 50×32 with portals is never compared with a plain 15×10.
      </p>

      <div className="field">
        <label>Algorithm</label>
        <Segmented
          value={draft.algorithm}
          options={ALGORITHM_IDS}
          label={(id) => GENERATORS[id].name}
          onChange={(algorithm) => update({ algorithm })}
        />
        <p className="help">{GENERATORS[draft.algorithm].description}</p>
      </div>

      <div className="field">
        <label>Size</label>
        <Segmented
          value={draft.sizePreset}
          options={SIZE_PRESET_IDS}
          label={(id) =>
            id === 'custom' ? 'Custom' : `${SIZE_PRESETS[id].label} ${SIZE_PRESETS[id].width}×${SIZE_PRESETS[id].height}`
          }
          onChange={(sizePreset) => update({ sizePreset })}
        />
        {draft.sizePreset === 'custom' && (
          <div className="size-inputs">
            <input
              type="number"
              min={CUSTOM_SIZE_MIN}
              max={CUSTOM_SIZE_MAX}
              value={draft.customWidth}
              onChange={(e) => update({ customWidth: e.target.valueAsNumber })}
              aria-label="Width"
            />
            <span>×</span>
            <input
              type="number"
              min={CUSTOM_SIZE_MIN}
              max={CUSTOM_SIZE_MAX}
              value={draft.customHeight}
              onChange={(e) => update({ customHeight: e.target.valueAsNumber })}
              aria-label="Height"
            />
            <span className="help">
              {CUSTOM_SIZE_MIN}–{CUSTOM_SIZE_MAX} cells
            </span>
          </div>
        )}
      </div>

      <div className="field">
        <label>Fog of war</label>
        <Segmented
          value={draft.fog}
          options={FOG_LEVEL_IDS}
          label={(id) => FOG_LEVELS[id].label}
          onChange={(fog) => update({ fog })}
        />
      </div>

      <div className="field">
        <label>Hints</label>
        <Segmented
          value={draft.hints}
          options={HINT_OPTIONS}
          label={(n) => (n === 0 ? 'Off' : String(n))}
          onChange={(hints) => update({ hints })}
        />
      </div>

      <div className="field">
        <label>Arcade features</label>
        <Segmented
          value={draft.arcade}
          options={ARCADE_LEVELS}
          label={(level) => ARCADE_LABELS[level]}
          onChange={(arcade) => update({ arcade })}
        />
        <p className="help">
          {spec
            ? `Portals, keys and locked gates, one-way doors and wall-break charges, placed by the seed the way the Daily Arcade's are. On ${size.width}×${size.height}: ${spec.portalPairs} portal pair${spec.portalPairs === 1 ? '' : 's'}, ${spec.gates} gate${spec.gates === 1 ? '' : 's'} with a key each, ${spec.oneWays} one-way door${spec.oneWays === 1 ? '' : 's'}, ${spec.boxes} mystery box${spec.boxes === 1 ? '' : 'es'}.`
            : 'A plain maze: walls, a start and an exit.'}
        </p>
      </div>

      <div className="field">
        <label>Breadcrumbs</label>
        <Segmented
          value={draft.breadcrumbs ? 'on' : 'off'}
          options={['off', 'on'] as const}
          label={(v) => (v === 'on' ? 'On' : 'Off')}
          onChange={(v) => update({ breadcrumbs: v === 'on' })}
        />
        <p className="help">Mark the passages you've already walked. Doesn't affect best times.</p>
      </div>

      <footer className="dialog-footer">
        <div className="footer-left">
          <button className="btn" onClick={() => run(onSaveDefaults(sanitizeSettings(draft)), 'Saved as default')}>
            Save as default
          </button>
          {hasSavedDefaults && (
            <button className="btn btn-ghost" onClick={() => run(onClearDefaults(), 'Saved default cleared')}>
              Clear default
            </button>
          )}
          {status && <span className="status">{status}</span>}
        </div>
        <div className="footer-right">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onStart(sanitizeSettings({ ...draft, seedMode: 'random' }))}
            autoFocus={autoStart}
          >
            Start custom maze
          </button>
        </div>
      </footer>
    </Dialog>
  )
}
