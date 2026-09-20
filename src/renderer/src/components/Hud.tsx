import { useEffect, useState } from 'react'
import { dailyLabel, GAME_MODES, MODE_BLURBS, MODE_LABELS, type GameMode } from '../../../core/daily'
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
  /** Which of the four ways to play this run is. */
  mode: GameMode
  onPlayMode: (mode: GameMode) => void
  doozieUnlocked: boolean
  breadcrumbs: boolean
  /** Today's scored daily attempt, when playing one of the daily mazes. */
  daily: { result: DailyResult; outcome: DailyOutcome } | null
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

/**
 * The four modes, as buttons. This is the app's navigation: everything that is
 * not a way to play lives behind Menu.
 */
function ModeButtons({
  mode,
  doozieUnlocked,
  onPlayMode
}: Pick<Props, 'mode' | 'doozieUnlocked' | 'onPlayMode'>) {
  return (
    <div className="modes" role="group" aria-label="Game modes">
      {GAME_MODES.map((option) => {
        const locked = option === 'doozie' && !doozieUnlocked && mode !== 'doozie'
        return (
          <button
            key={option}
            className={option === mode ? 'btn mode active' : 'btn mode'}
            aria-pressed={option === mode}
            disabled={locked}
            onClick={() => onPlayMode(option)}
            title={locked ? "Solve today's daily maze to unlock the Doozie" : MODE_BLURBS[option]}
          >
            {locked ? '🔒 ' : ''}
            {MODE_LABELS[option]}
          </button>
        )
      })}
    </div>
  )
}

export function Hud({
  session,
  mode,
  onPlayMode,
  doozieUnlocked,
  breadcrumbs,
  daily,
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

  /**
   * Arcade's wall-break charge. You start with none and the only source is a
   * mystery box, so the control says where you stand until you hold one.
   */
  const breakDetail =
    session.breaksLeft > 0
      ? `${session.breaksLeft} held`
      : session.boxesLeft > 0
        ? `${session.boxesLeft} box${session.boxesLeft === 1 ? '' : 'es'} left`
        : 'None'
  const breakTitle =
    session.breaksLeft > 0
      ? 'Arm a charge, then move into the wall to smash it (X)'
      : 'Open a ? box and hope for a charge'
  const jumpDetail =
    session.jumpsLeft > 0
      ? `${session.jumpsLeft} held`
      : session.boxesLeft > 0
        ? `${session.boxesLeft} box${session.boxesLeft === 1 ? '' : 'es'} left`
        : 'None'
  const jumpTitle =
    session.jumpsLeft > 0
      ? 'Arm a jump, then move into the wall to hop it (Z)'
      : 'Open a ? box and hope for a jump'
  const breakAction: SheetAction[] = session.isArcade
    ? [
        {
          key: 'break',
          label: 'Break a wall',
          title: breakTitle,
          detail: breakDetail,
          pressed: session.breakArmed,
          disabled: session.breaksLeft === 0 || runOver,
          onClick: () => session.armBreak()
        },
        {
          key: 'jump',
          label: 'Jump a wall',
          title: jumpTitle,
          detail: jumpDetail,
          pressed: session.jumpArmed,
          disabled: session.jumpsLeft === 0 || runOver,
          onClick: () => session.armJump()
        }
      ]
    : []

  /** Every control that is not a mode, in the order the menu lists them. */
  const actions: SheetAction[] = [
    { key: 'new', label: 'New maze', title: 'New maze (N)', onClick: onNewMaze, primary: true },
    { key: 'retry', label: 'Retry this maze', title: 'Play the same maze again (R)', onClick: onRetry },
    ...hintAction,
    ...breakAction,
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
    { key: 'settings', label: 'Custom maze settings', title: 'Size, algorithm, fog and hints (Esc)', onClick: onOpenSettings },
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
      {session.isArcade && (
        <span className="stat" title="Keys in hand; a locked gate costs one">
          <span className="stat-label">Keys</span>
          <span className="stat-value mono">
            {/* The compact header drops stat labels, so the key says what the number is. */}
            <span className="stat-icon" aria-hidden="true">
              🔑
            </span>
            {session.keysHeld}
          </span>
        </span>
      )}
    </>
  )

  const menuButton = (
    <button className="btn hud-menu" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" title="Menu">
      <span aria-hidden="true">☰</span> Menu
    </button>
  )

  const sheet = menuOpen && (
    <ActionSheet actions={actions} onClose={() => setMenuOpen(false)}>
      {narrow && (
        // On a phone the header has no room for four mode buttons, so the menu
        // is where the modes live — first, above everything else.
        <div className="sheet-modes">
          <span className="sheet-group-label">Play</span>
          {GAME_MODES.map((option) => {
            const locked = option === 'doozie' && !doozieUnlocked && mode !== 'doozie'
            return (
              <button
                key={option}
                className={option === mode ? 'sheet-item active' : 'sheet-item'}
                aria-pressed={option === mode}
                disabled={locked}
                onClick={() => {
                  onPlayMode(option)
                  setMenuOpen(false)
                }}
                title={MODE_BLURBS[option]}
              >
                <span>
                  {locked ? '🔒 ' : ''}
                  {MODE_LABELS[option]}
                </span>
                <span className="sheet-detail">{locked ? 'Solve the Daily first' : MODE_BLURBS[option]}</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="sheet-summary help">{describeModifiers(session.settings, session.seed)}</p>
      {/* Wide screens already have Copy score in the header. */}
      {narrow && daily && daily.outcome !== 'in-progress' && (
        <div className="sheet-score">
          <CopyScoreButton result={daily.result} outcome={daily.outcome} className="btn btn-primary" />
        </div>
      )}
    </ActionSheet>
  )

  // Phones get a single compact row — which run this is, how it is going, and a
  // menu for everything else. Wider screens keep the full header.
  if (narrow) {
    return (
      <>
        <header className="hud hud-compact">
          {seedButton}
          {stats}
          {menuButton}
        </header>
        {sheet}
      </>
    )
  }

  return (
    <>
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
          {/*
            * Only once there is something to spend: a pair of buttons reading
            * zero would take header room for most of a run, and the menu lists
            * both whether or not you hold one.
            */}
          {session.breaksLeft > 0 && (
            <button
              className="btn"
              aria-pressed={session.breakArmed}
              onClick={() => session.armBreak()}
              disabled={runOver}
              title={breakTitle}
            >
              {session.breakArmed ? 'Pick a wall' : 'Break'} <span className="mono">{session.breaksLeft}</span>
            </button>
          )}
          {session.jumpsLeft > 0 && (
            <button
              className="btn"
              aria-pressed={session.jumpArmed}
              onClick={() => session.armJump()}
              disabled={runOver}
              title={jumpTitle}
            >
              {session.jumpArmed ? 'Pick a wall' : 'Jump'} <span className="mono">{session.jumpsLeft}</span>
            </button>
          )}
          {daily && daily.outcome !== 'in-progress' && <CopyScoreButton result={daily.result} outcome={daily.outcome} />}
        </div>

        <div className="hud-group">
          <ModeButtons mode={mode} doozieUnlocked={doozieUnlocked} onPlayMode={onPlayMode} />
          {menuButton}
        </div>
      </header>
      {sheet}
    </>
  )
}
