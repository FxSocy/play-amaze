import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { DEFAULT_APPEARANCE, resolvePalette, type Appearance } from '../../core/appearance'
import { dailyKind, dailySeed, dailySettings, type DailyKind } from '../../core/daily'
import {
  dailyOutcome,
  finishDailyResult,
  startDailyResult,
  type DailyOutcome,
  type DailyResult
} from '../../core/dailyScore'
import { bestRecord, createRecord, type TimeRecord } from '../../core/records'
import { randomId, randomSeed } from '../../core/rng'
import { GameSession } from '../../core/session'
import { DEFAULT_SETTINGS, modifierKey, type GameSettings } from '../../core/settings'
import { api } from './api'
import { AppearanceDialog } from './components/AppearanceDialog'
import { ConfirmLeaveDailyDialog, DailyScorePanel, DoozieUnlocked, StartOverlay } from './components/DailyScore'
import { FinishDialog } from './components/FinishDialog'
import { ConfirmGiveUpDialog, GaveUpDialog } from './components/GiveUpDialogs'
import { Hud } from './components/Hud'
import { RecordsDialog } from './components/RecordsDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { TouchHint } from './components/TouchHint'
import { GameCanvas } from './game/GameCanvas'
import { applyPalette, useIsTouch, usePrefersDark } from './theme'

type DialogState =
  | { kind: 'settings' }
  | { kind: 'appearance' }
  | { kind: 'records' }
  | { kind: 'confirm-give-up' }
  | { kind: 'gave-up' }
  | { kind: 'finish'; record: TimeRecord; previousBest: TimeRecord | null }
  | { kind: 'confirm-leave'; action: () => void }
  | null

interface Boot {
  settings: GameSettings
  hasSavedDefaults: boolean
  records: TimeRecord[]
  dailyResults: DailyResult[]
  appearance: Appearance
}

/** The session that owns today's scored daily attempt in this app, if any. */
interface ScoredRun {
  session: GameSession
  attemptId: string
}

function createSession(settings: GameSettings, kind: DailyKind = 'daily'): GameSession {
  if (settings.seedMode === 'daily') {
    const seed = dailySeed(new Date(), kind)
    return new GameSession(dailySettings(settings, seed), seed)
  }
  return new GameSession(settings, randomSeed())
}

export function App() {
  const [boot, setBoot] = useState<Boot | null>(null)

  useEffect(() => {
    Promise.all([api.getDefaults(), api.listRecords(), api.listDailyResults(), api.getAppearance()])
      .then(([defaults, records, dailyResults, appearance]) =>
        setBoot({
          settings: defaults ?? { ...DEFAULT_SETTINGS },
          hasSavedDefaults: defaults !== null,
          records,
          dailyResults,
          appearance: appearance ?? { ...DEFAULT_APPEARANCE }
        })
      )
      .catch((err: unknown) => {
        console.error('Failed to load saved data', err)
        setBoot({
          settings: { ...DEFAULT_SETTINGS },
          hasSavedDefaults: false,
          records: [],
          dailyResults: [],
          appearance: { ...DEFAULT_APPEARANCE }
        })
      })
  }, [])

  return boot ? <Game boot={boot} /> : null
}

function Game({ boot }: { boot: Boot }) {
  const [settings, setSettings] = useState(boot.settings)
  const [hasSavedDefaults, setHasSavedDefaults] = useState(boot.hasSavedDefaults)
  const [records, setRecords] = useState(boot.records)
  const [session, setSession] = useState(() => createSession(boot.settings))
  const [dialog, setDialog] = useState<DialogState>(null)
  const [fitRequest, setFitRequest] = useState(0)
  const [dailyResults, setDailyResults] = useState(() => {
    const bySeed: Record<string, DailyResult> = {}
    for (const result of boot.dailyResults) bySeed[result.seed] = result
    return bySeed
  })
  const [scored, setScored] = useState<ScoredRun | null>(null)
  const [appearance, setAppearance] = useState(boot.appearance)
  const prefersDark = usePrefersDark()
  const touch = useIsTouch()
  const palette = useMemo(() => resolvePalette(appearance, prefersDark), [appearance, prefersDark])

  useEffect(() => applyPalette(palette), [palette])

  // Save appearance changes, debounced so dragging the colour picker doesn't write on every tick.
  const savedAppearance = useRef(boot.appearance)
  useEffect(() => {
    if (appearance === savedAppearance.current) return
    const id = window.setTimeout(() => {
      savedAppearance.current = appearance
      api.saveAppearance(appearance).catch((err: unknown) => console.error('Failed to save appearance', err))
    }, 300)
    return () => window.clearTimeout(id)
  }, [appearance])

  // Re-render the HUD whenever the session's state changes.
  useSyncExternalStore(session.subscribe, () => session.version)

  const storeDailyResult = useCallback((result: DailyResult) => {
    setDailyResults((rs) => ({ ...rs, [result.seed]: result }))
  }, [])

  /** Whether `s` is the session playing today's scored attempt (rather than practice). */
  const isScoredSession = (s: GameSession): boolean =>
    scored?.session === s && dailyResults[s.seed]?.attemptId === scored.attemptId

  /** Today's scored result for the current daily maze, with its outcome. */
  const dailyResult = dailyResults[session.seed]
  const daily: { result: DailyResult; outcome: DailyOutcome } | null =
    session.settings.seedMode === 'daily' && dailyResult
      ? {
          result: dailyResult,
          outcome: dailyOutcome(dailyResult, isScoredSession(session) && !session.finished)
        }
      : null

  /** Records the final result of the scored attempt once `s` has ended. */
  const finishScoredRun = (s: GameSession): void => {
    const current = dailyResults[s.seed]
    if (!current || current.status !== 'started' || !isScoredSession(s)) return
    const result = finishDailyResult(current, s)
    storeDailyResult(result)
    api
      .finishDailyResult(result)
      .then((stored) => stored && storeDailyResult(stored))
      .catch((err: unknown) => console.error('Failed to save daily score', err))
  }

  const start = useCallback(() => {
    const s = session
    if (!s.begin(performance.now())) return
    // The first run started each day is the scored one; everything after is practice.
    if (s.settings.seedMode !== 'daily' || dailyResults[s.seed]) return
    const claim = startDailyResult(s.seed, randomId())
    setScored({ session: s, attemptId: claim.attemptId })
    storeDailyResult(claim)
    api
      .startDailyResult(claim)
      .then(storeDailyResult)
      .catch((err: unknown) => console.error('Failed to save daily attempt', err))
  }, [session, dailyResults, storeDailyResult])

  // Leaving the scored run early would allow a peek-then-restart, so it ends the attempt.
  const scoredRunInProgress = isScoredSession(session) && !session.awaitingStart && !session.finished
  const guardLeave = (action: () => void): void => {
    if (scoredRunInProgress) setDialog({ kind: 'confirm-leave', action })
    else action()
  }

  /** Which daily maze N / New maze replays while in daily mode. */
  const [kind, setKind] = useState<DailyKind>('daily')
  const newMaze = useCallback((next: GameSettings = settings, nextKind: DailyKind = kind) => {
    setSettings(next)
    setKind(nextKind)
    setSession(createSession(next, nextKind))
    setDialog(null)
  }, [settings, kind])

  // The Doozie unlocks once today's standard daily has been solved, scored or practice.
  const todaySeed = dailySeed()
  const doozieUnlocked =
    dailyResults[todaySeed]?.status === 'solved' || records.some((r) => r.seed === todaySeed)
  const playDaily = (nextKind: DailyKind): void => {
    if (nextKind === 'doozie' && !doozieUnlocked) return
    guardLeave(() => newMaze({ ...settings, seedMode: 'daily' }, nextKind))
  }
  const isDaily = session.settings.seedMode === 'daily'
  const justSolvedDaily = isDaily && dailyKind(session.seed) === 'daily' && session.solved

  const retry = useCallback(() => {
    setSession((s) => new GameSession(s.settings, s.seed))
    setDialog(null)
  }, [])

  const leaveScoredRun = (action: () => void): void => {
    session.giveUp(performance.now())
    handled.current = session
    finishScoredRun(session)
    action()
  }

  const requestGiveUp = useCallback(() => {
    if (!session.finished) setDialog({ kind: 'confirm-give-up' })
  }, [session])

  const toggleBreadcrumbs = useCallback(() => {
    setSettings((s) => ({ ...s, breadcrumbs: !s.breadcrumbs }))
  }, [])

  // React once when the run ends: record solved runs, explain give-ups.
  const handled = useRef<GameSession | null>(null)
  useEffect(() => {
    if (!session.finished || handled.current === session) return
    handled.current = session
    finishScoredRun(session)
    if (session.gaveUp) {
      setDialog({ kind: 'gave-up' })
      return
    }
    const record = createRecord(session)
    setDialog({ kind: 'finish', record, previousBest: bestRecord(records, record.key) })
    setRecords((rs) => [...rs, record])
    api.addRecord(record).catch((err: unknown) => console.error('Failed to save time', err))
  })

  useEffect(() => {
    if (dialog) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      switch (e.code) {
        case 'Enter':
        case 'Space':
          if (!session.awaitingStart) return
          e.preventDefault()
          return start()
        case 'KeyN':
          return guardLeave(() => newMaze())
        case 'KeyR':
          return guardLeave(retry)
        case 'KeyE':
          session.useHint(performance.now())
          return
        case 'KeyG':
          return requestGiveUp()
        case 'KeyT':
          return toggleBreadcrumbs()
        case 'KeyF':
          return setFitRequest((n) => n + 1)
        case 'KeyB':
          return setDialog({ kind: 'records' })
        case 'KeyP':
          return setDialog({ kind: 'appearance' })
        case 'Escape':
          return setDialog({ kind: 'settings' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const closeDialog = useCallback(() => setDialog(null), [])

  return (
    <div className="app">
      <Hud
        session={session}
        breadcrumbs={settings.breadcrumbs}
        onToggleBreadcrumbs={toggleBreadcrumbs}
        daily={daily}
        doozieUnlocked={doozieUnlocked}
        onPlayDaily={playDaily}
        onGiveUp={requestGiveUp}
        onNewMaze={() => guardLeave(() => newMaze())}
        onRetry={() => guardLeave(retry)}
        onOpenSettings={() => setDialog({ kind: 'settings' })}
        onOpenAppearance={() => setDialog({ kind: 'appearance' })}
        onOpenRecords={() => setDialog({ kind: 'records' })}
        onFit={() => setFitRequest((n) => n + 1)}
        touchDpad={appearance.touchDpad}
        onToggleDpad={() => setAppearance((a) => ({ ...a, touchDpad: !a.touchDpad }))}
      />
      <main className="stage">
        <GameCanvas
          session={session}
          inputEnabled={dialog === null}
          fitRequest={fitRequest}
          breadcrumbs={settings.breadcrumbs}
          appearance={appearance}
          palette={palette}
        />
        {touch && !appearance.touchHintSeen && !session.awaitingStart && (
          <TouchHint
            onDismiss={() => setAppearance((a) => ({ ...a, touchHintSeen: true }))}
            onUseDpad={() => setAppearance((a) => ({ ...a, touchHintSeen: true, touchDpad: true }))}
          />
        )}
        {session.awaitingStart && (
          <StartOverlay
            session={session}
            existing={daily}
            onStart={start}
            onSwitch={
              dailyKind(session.seed) === 'doozie'
                ? () => playDaily('daily')
                : doozieUnlocked
                  ? () => playDaily('doozie')
                  : undefined
            }
          />
        )}
      </main>
      <footer className="controls-hint">
        {touch ? (
          <>
            Drag to move · Tap to backtrack · Two fingers to pan · Pinch to zoom
            {session.settings.hints > 0 && ' · Hint in the header'}
          </>
        ) : (
          <>
            Arrows / WASD / HJKL move · Click to backtrack · Drag from player to trace · Scroll zoom · F fit
            {session.settings.hints > 0 && ' · E hint'} · T breadcrumbs · G give up · N new · R retry
          </>
        )}
      </footer>

      {dialog?.kind === 'settings' && (
        <SettingsDialog
          settings={settings}
          hasSavedDefaults={hasSavedDefaults}
          onStart={(next) => guardLeave(() => newMaze(next, 'daily'))}
          onSaveDefaults={async (s) => {
            await api.saveDefaults(s)
            setHasSavedDefaults(true)
          }}
          onClearDefaults={async () => {
            await api.clearDefaults()
            setHasSavedDefaults(false)
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'appearance' && (
        <AppearanceDialog
          appearance={appearance}
          prefersDark={prefersDark}
          onChange={setAppearance}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'records' && (
        <RecordsDialog
          records={records}
          currentKey={modifierKey(session.settings, session.seed)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'confirm-give-up' && (
        <ConfirmGiveUpDialog onConfirm={() => session.giveUp(performance.now())} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'gave-up' && (
        <GaveUpDialog session={session} onRetry={retry} onNewMaze={() => newMaze()} onClose={closeDialog}>
          {daily && <DailyScorePanel {...daily} practice={!isScoredSession(session)} />}
        </GaveUpDialog>
      )}
      {dialog?.kind === 'finish' && (
        <FinishDialog
          record={dialog.record}
          previousBest={dialog.previousBest}
          onRetry={retry}
          onNewMaze={() => newMaze()}
          onClose={closeDialog}
        >
          {daily && <DailyScorePanel {...daily} practice={!isScoredSession(session)} />}
          {justSolvedDaily && <DoozieUnlocked onPlay={() => playDaily('doozie')} />}
        </FinishDialog>
      )}
      {dialog?.kind === 'confirm-leave' && (
        <ConfirmLeaveDailyDialog onConfirm={() => leaveScoredRun(dialog.action)} onCancel={closeDialog} />
      )}
    </div>
  )
}
