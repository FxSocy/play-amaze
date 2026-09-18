import { useState } from 'react'
import { dailySeed, dailySettings } from '../../../core/daily'
import { ALGORITHM_IDS, GENERATORS } from '../../../core/generators'
import {
  CUSTOM_SIZE_MAX,
  CUSTOM_SIZE_MIN,
  describeModifiers,
  FOG_LEVEL_IDS,
  FOG_LEVELS,
  HINT_OPTIONS,
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

export function SettingsDialog({ settings, hasSavedDefaults, onStart, onSaveDefaults, onClearDefaults, onClose }: Props) {
  const [draft, setDraft] = useState(settings)
  const [status, setStatus] = useState<string | null>(null)
  const isDaily = draft.seedMode === 'daily'
  const todaySeed = dailySeed()
  const daily = dailySettings(draft, todaySeed)
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
    <Dialog title="Settings" onClose={onClose}>
      <div className="field">
        <label>Mode</label>
        <Segmented
          value={draft.seedMode}
          options={['daily', 'random'] as const}
          label={(mode) => (mode === 'daily' ? 'Daily maze' : 'Custom')}
          onChange={(seedMode) => update({ seedMode })}
        />
        <p className="help">
          {isDaily
            ? `Today's standard maze, the same for everyone so times can be compared: ${describeModifiers(daily, todaySeed)}. A new one starts at 00:00 UTC. Solve it to unlock the Daily Doozie, a hard mode daily.`
            : 'A random maze with your own algorithm, size and modifiers.'}
        </p>
      </div>

      {!isDaily && (
        <>
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
        </>
      )}

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
          <button className="btn btn-primary" onClick={() => onStart(sanitizeSettings(draft))}>
            Start maze
          </button>
        </div>
      </footer>
    </Dialog>
  )
}
