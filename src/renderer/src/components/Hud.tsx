import { useEffect, useState } from 'react'
import { dailyKind, dailyLabel, type DailyKind } from '../../../core/daily'
import type { DailyOutcome, DailyResult } from '../../../core/dailyScore'
import { formatTime } from '../../../core/records'
import type { GameSession } from '../../../core/session'
import { describeModifiers } from '../../../core/settings'
import { copyText } from '../clipboard'
import { useIsNarrow } from '../theme'
import { ActionSheet, type SheetAction } from './ActionSheet'
import { CopyScoreButton } from './DailyScore'

interface Props {
  session: GameSession
  breadcrumbs: boolean
  /** Today's scored daily attempt, when playing the daily maze. */
  daily: { result: DailyResult; outcome: DailyOutcome } | null
  doozieUnlocked: boolean
  onPlayDaily: (kind: DailyKind) => void
  onToggleBreadcrumbs: () => void
  onGiveUp: () => void
  onNewMaze: () => void
  onRetry: () => void
  onOpenSettings: () => void
  onOpenAppearance: () => void
  onOpenRecords: () => void
  onFit: () => void
  /** Whether the on-screen direction pad is showing (touch devices only). */
  touchDpad: boolean
  onToggleDpad: () => void
}

function Timer({ session }: { session: GameSession }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(id)
  }, [])
  return <span className="stat-value mono">{formatTime(session.elapsed(now))}</span>
}

export function Hud({
  session,
  breadcrumbs,
  daily,
  doozieUnlocked,
  onPlayDaily,
  onToggleBreadcrumbs,
  onGiveUp,
  onNewMaze,
  onRetry,
  onOpenSettings,
  onOpenAppearance,
  onOpenRecords,
  onFit,
  touchDpad,
  onToggleDpad
}: Props) {
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const narrow = useIsNarrow()
  const isDaily = session.settings.seedMode === 'daily'
  const onDoozie = isDaily && dailyKind(session.seed) === 'doozie'
  const runOver = session.finished || session.awaitingStart

  const copySeed = (): void => {
    void copyText(session.seed).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }

  const hintAction: SheetAction[] =
    session.settings.hints > 0
      ? [
          {
            key: 'hint',
            label: 'Hint',
            title: 'Show the next steps (E)',
            detail: `${session.hintsRemaining} left`,
            disabled: session.hintsRemaining === 0 || runOver,
            onClick: () => session.useHint(performance.now())
          }
        ]
      : []

  const doozieAction: SheetAction[] = isDaily
    ? [
        {
          key: 'doozie',
          label: onDoozie
            ? "Back to today's daily"
            : doozieUnlocked
              ? 'Play the Daily Doozie'
              : 'Daily Doozie (locked)',
          title: onDoozie
            ? "Back to today's daily maze"
            : doozieUnlocked
              ? "Play today's hard mode daily"
              : "Solve today's daily maze to unlock the Doozie",
          disabled: !onDoozie && !doozieUnlocked,
          onClick: () => onPlayDaily(onDoozie ? 'daily' : 'doozie')
        }
      ]
    : []

  /** Every control, in the order the phone menu lists them. */
  const actions: SheetAction[] = [
    { key: 'new', label: 'New maze', title: 'New maze (N)', onClick: onNewMaze, primary: true },
    { key: 'retry', label: 'Retry this maze', title: 'Play the same maze again (R)', onClick: onRetry },
    ...doozieAction,
    ...hintAction,
    {
      key: 'breadcrumbs',
      label: 'Breadcrumbs',
      title: "Show passages you've walked (T)",
      pressed: breadcrumbs,
      onClick: onToggleBreadcrumbs,
      separated: true
    },
    { key: 'fit', label: 'Fit maze to screen', title: 'Fit maze to window (F)', onClick: onFit },
    {
      key: 'dpad',
      label: 'Direction pad',
      title: 'Show arrow buttons instead of dragging to move',
      pressed: touchDpad,
      onClick: onToggleDpad
    },
    { key: 'appearance', label: 'Appearance', title: 'Theme, maze style and dot (P)', onClick: onOpenAppearance },
    { key: 'records', label: 'Best times', title: 'Best times (B)', onClick: onOpenRecords },
    { key: 'settings', label: 'Settings', title: 'Settings (Esc)', onClick: onOpenSettings },
    {
      key: 'giveup',
      label: 'Give up',
      title: 'Give up and reveal the route (G)',
      onClick: onGiveUp,
      disabled: runOver,
      danger: true,
      separated: true
    }
  ]

  const seedButton = (
    <button className="seed" onClick={copySeed} title="Copy seed">
      <span className="seed-label">{isDaily ? dailyLabel(session.seed) : 'Seed'}</span>
      <span className="mono seed-value">{copied ? 'Copied' : session.seed}</span>
    </button>
  )

  const stats = (
    <>
      <span className="stat">
        <span className="stat-label">Time</span>
        <Timer session={session} />
      </span>
      <span className="stat">
        <span className="stat-label">Moves</span>
        <span className="stat-value mono">{session.moves}</span>
      </span>
    </>
  )

  // Phones get a single compact row — which run this is, how it is going, and a
  // menu for everything else. Wider screens keep the full header.
  if (narrow) {
    return (
      <>
        <header className="hud hud-compact">
          {seedButton}
          {stats}
          <button className="btn hud-menu" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" title="Menu">
            <span aria-hidden="true">☰</span> Menu
          </button>
        </header>
        {menuOpen && (
          <ActionSheet actions={actions} onClose={() => setMenuOpen(false)}>
            <p className="sheet-summary help">{describeModifiers(session.settings, session.seed)}</p>
            {daily && daily.outcome !== 'in-progress' && (
              <div className="sheet-score">
                <CopyScoreButton result={daily.result} outcome={daily.outcome} className="btn btn-primary" />
              </div>
            )}
          </ActionSheet>
        )}
      </>
    )
  }

  return (
    <header className="hud">
      <div className="hud-group">
        <span className="brand">Amaze</span>
        {seedButton}
        <span className="modifiers">{describeModifiers(session.settings, session.seed)}</span>
      </div>

      <div className="hud-group">
        {stats}
        {session.settings.hints > 0 && (
          <button
            className="btn"
            onClick={() => session.useHint(performance.now())}
            disabled={session.hintsRemaining === 0 || runOver}
            title="Show the next steps (E)"
          >
            Hint <span className="mono">{session.hintsRemaining}</span>
          </button>
        )}
        {daily && daily.outcome !== 'in-progress' && <CopyScoreButton result={daily.result} outcome={daily.outcome} />}
        <button className="btn" onClick={onGiveUp} disabled={runOver} title="Give up and reveal the route (G)">
          Give up
        </button>
      </div>

      <div className="hud-group">
        {isDaily && (
          <button
            className="btn"
            aria-pressed={onDoozie}
            onClick={() => onPlayDaily(onDoozie ? 'daily' : 'doozie')}
            disabled={!onDoozie && !doozieUnlocked}
            title={
              onDoozie
                ? "Back to today's daily maze"
                : doozieUnlocked
                  ? "Play today's hard mode daily"
                  : "Solve today's daily maze to unlock the Doozie"
            }
          >
            {onDoozie ? 'Daily' : doozieUnlocked ? 'Doozie' : '🔒 Doozie'}
          </button>
        )}
        <button
          className="btn"
          aria-pressed={breadcrumbs}
          onClick={onToggleBreadcrumbs}
          title="Show passages you've walked (T)"
        >
          Breadcrumbs
        </button>
        <button className="btn" onClick={onFit} title="Fit maze to window (F)">
          Fit
        </button>
        <button className="btn" onClick={onOpenRecords} title="Best times (B)">
          Best times
        </button>
        <button className="btn" onClick={onOpenAppearance} title="Theme, maze style and dot (P)">
          Appearance
        </button>
        <button className="btn" onClick={onOpenSettings} title="Settings (Esc)">
          Settings
        </button>
        <button className="btn btn-primary" onClick={onNewMaze} title="New maze (N)">
          New maze
        </button>
      </div>
    </header>
  )
}
