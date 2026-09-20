import { useState } from 'react'
import { dailyKind, dailyLabel } from '../../../core/daily'
import { dailyPoints, dailyShareText, type DailyOutcome, type DailyResult } from '../../../core/dailyScore'
import { formatTime } from '../../../core/records'
import type { GameSession } from '../../../core/session'
import { describeModifiers } from '../../../core/settings'
import { copyText } from '../clipboard'
import { Dialog } from './Dialog'

export function CopyScoreButton({
  result,
  outcome,
  className = 'btn'
}: {
  result: DailyResult
  outcome: DailyOutcome
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    void copyText(dailyShareText(result, outcome)).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <button className={className} onClick={copy} title="Copy your daily score to share">
      {copied ? 'Copied' : 'Copy score'}
    </button>
  )
}

interface PanelProps {
  result: DailyResult
  outcome: DailyOutcome
  /** The run that just ended was practice, not the scored attempt. */
  practice: boolean
}

/** Today's scored daily attempt, shown after a daily run ends. */
export function DailyScorePanel({ result, outcome, practice }: PanelProps) {
  const solved = outcome === 'solved' && result.timeMs !== null && result.moves !== null
  return (
    <div className="daily-score">
      <div className="daily-score-main">
        <span className="stat-label">{practice ? "Today's score (unchanged)" : "Today's score"}</span>
        {solved ? (
          <>
            <span className="result-value mono">{dailyPoints(result.timeMs!, result.moves!)} pts</span>
            <span className="help">
              {formatTime(result.timeMs!)} × {result.moves} moves · lower is better
            </span>
          </>
        ) : (
          <>
            <span className="result-value">Did not finish</span>
            <span className="help">Only your first attempt each day is scored.</span>
          </>
        )}
      </div>
      {outcome !== 'in-progress' && <CopyScoreButton result={result} outcome={outcome} />}
      {practice && <p className="help daily-score-note">That was a practice run. Only your first attempt counts.</p>}
    </div>
  )
}

interface OverlayProps {
  session: GameSession
  /** Today's scored attempt at this maze, if the player already has one. */
  existing: { result: DailyResult; outcome: DailyOutcome } | null
  onStart: () => void
  /** Switches to the other daily maze, when it's available. */
  onSwitch?: () => void
}

export function StartOverlay({ session, existing, onStart, onSwitch }: OverlayProps) {
  const scored = existing?.outcome === 'solved' && existing.result.timeMs !== null && existing.result.moves !== null
  const kind = dailyKind(session.seed)
  const doozie = kind === 'doozie'
  const arcade = kind === 'arcade'
  return (
    <div className="start-overlay">
      <div className={`start-card${doozie ? ' doozie' : ''}${arcade ? ' arcade' : ''}`}>
        <h2>
          {doozie ? '🔥 ' : ''}
          {arcade ? '🌀 ' : ''}
          {dailyLabel(session.seed)}
          {existing ? ' · practice' : ''}
        </h2>
        <span className="help">{describeModifiers(session.settings, session.seed)}</span>
        {doozie && <p className="help">The exit flashes for three seconds when you start, so you know which way to head.</p>}
        {arcade && session.features && <ArcadeRules session={session} />}
        {existing ? (
          <p className="help">
            You've already played today
            {scored
              ? ` (${dailyPoints(existing.result.timeMs!, existing.result.moves!)} pts)`
              : ' (did not finish)'}
            . Practice runs won't change your score.
          </p>
        ) : (
          <p className="help">
            The maze is revealed and the timer starts the moment you press Start. Only this first attempt is
            scored. Leaving the run or giving up counts as did not finish.
          </p>
        )}
        <button className="btn btn-primary start-button" onClick={onStart} autoFocus>
          {existing ? 'Start practice' : 'Start'}
        </button>
        <span className="help">Enter or Space</span>
        {onSwitch && (
          <button className="btn btn-ghost" onClick={onSwitch}>
            {doozie ? '← Back to the daily maze' : '🔥 Play the Daily Doozie'}
          </button>
        )}
      </div>
    </div>
  )
}

/** What the maze has on it, explained once, before the clock starts. */
function ArcadeRules({ session }: { session: GameSession }) {
  const features = session.features!
  return (
    <ul className="arcade-rules help">
      <li>
        <strong>Portals</strong> — step on one of a matching pair and come out at the other.
      </li>
      {features.gateCells.length > 0 && (
        <li>
          <strong>Keys and gates</strong> — pick up a key, spend it to open a barred gate. Every key is
          findable before the gate that needs it.
        </li>
      )}
      <li>
        <strong>One-way doors</strong> — a chevron marks a passage you can only take one way.
      </li>
      {features.boxCells.length > 0 && (
        <li>
          <strong>
            {features.boxCells.length} ? box{features.boxCells.length === 1 ? '' : 'es'}
          </strong>{' '}
          — at dead ends, so reaching one is a detour. Opening it spins for one of four: a wall-break
          charge, a jump over one wall — or the lights going out, or a trip back to the start.
        </li>
      )}
    </ul>
  )
}

export function ConfirmLeaveDailyDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog title="Leave today's scored run?" onClose={onCancel}>
      <p>This is your scored daily attempt. Leaving it now records today's result as did not finish, and later runs are practice only.</p>
      <footer className="dialog-footer">
        <div className="footer-left" />
        <div className="footer-right">
          <button className="btn btn-ghost" onClick={onCancel} autoFocus>
            Keep playing
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Leave run
          </button>
        </div>
      </footer>
    </Dialog>
  )
}

/** Shown after solving the standard daily: the hard mode daily is now open. */
export function DoozieUnlocked({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="daily-score doozie">
      <div className="daily-score-main">
        <span className="stat-label">🔥 Daily Doozie unlocked</span>
        <span className="help">Today's hard mode: a much bigger maze in fog. Scored the same way, first attempt only.</span>
      </div>
      <button className="btn btn-primary" onClick={onPlay}>
        Play Doozie
      </button>
    </div>
  )
}
