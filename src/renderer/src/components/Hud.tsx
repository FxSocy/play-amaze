import { useEffect, useState } from 'react'
import { dailyKind, dailyLabel, type DailyKind } from '../../../core/daily'
import type { DailyOutcome, DailyResult } from '../../../core/dailyScore'
import { formatTime } from '../../../core/records'
import type { GameSession } from '../../../core/session'
import { describeModifiers } from '../../../core/settings'
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
  onOpenSettings: () => void
  onOpenAppearance: () => void
  onOpenRecords: () => void
  onFit: () => void
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
  onOpenSettings,
  onOpenAppearance,
  onOpenRecords,
  onFit
}: Props) {
  const [copied, setCopied] = useState(false)
  const isDaily = session.settings.seedMode === 'daily'
  const onDoozie = isDaily && dailyKind(session.seed) === 'doozie'

  const copySeed = (): void => {
    void navigator.clipboard.writeText(session.seed).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <header className="hud">
      <div className="hud-group">
        <span className="brand">Amaze</span>
        <button className="seed" onClick={copySeed} title="Copy seed">
          <span className="seed-label">{isDaily ? dailyLabel(session.seed) : 'Seed'}</span>
          <span className="mono">{copied ? 'Copied' : session.seed}</span>
        </button>
        <span className="modifiers">{describeModifiers(session.settings, session.seed)}</span>
      </div>

      <div className="hud-group">
        <span className="stat">
          <span className="stat-label">Time</span>
          <Timer session={session} />
        </span>
        <span className="stat">
          <span className="stat-label">Moves</span>
          <span className="stat-value mono">{session.moves}</span>
        </span>
        {session.settings.hints > 0 && (
          <button
            className="btn"
            onClick={() => session.useHint(performance.now())}
            disabled={session.hintsRemaining === 0 || session.finished || session.awaitingStart}
            title="Show the next steps (E)"
          >
            Hint <span className="mono">{session.hintsRemaining}</span>
          </button>
        )}
        {daily && daily.outcome !== 'in-progress' && <CopyScoreButton result={daily.result} outcome={daily.outcome} />}
        <button className="btn" onClick={onGiveUp} disabled={session.finished || session.awaitingStart} title="Give up and reveal the route (G)">
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
