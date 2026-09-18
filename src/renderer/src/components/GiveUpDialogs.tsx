import type { ReactNode } from 'react'
import { formatTime } from '../../../core/records'
import type { GameSession } from '../../../core/session'
import { describeModifiers } from '../../../core/settings'
import { Dialog } from './Dialog'

export function ConfirmGiveUpDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog title="Give up?" onClose={onCancel}>
      <p>The route to the exit will be revealed and this run won't count towards your best times.</p>
      <footer className="dialog-footer">
        <div className="footer-left" />
        <div className="footer-right">
          <button className="btn btn-ghost" onClick={onCancel} autoFocus>
            Keep playing
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Give up
          </button>
        </div>
      </footer>
    </Dialog>
  )
}

interface GaveUpProps {
  session: GameSession
  onRetry: () => void
  onNewMaze: () => void
  onClose: () => void
  children?: ReactNode
}

export function GaveUpDialog({ session, onRetry, onNewMaze, onClose, children }: GaveUpProps) {
  const remaining = Math.max(0, (session.solution?.length ?? 1) - 1)
  return (
    <Dialog title="You gave up" onClose={onClose}>
      <p className="help">{describeModifiers(session.settings, session.seed)}</p>
      <div className="results">
        <div className="result">
          <span className="stat-label">Time</span>
          <span className="result-value mono">{formatTime(session.elapsed(session.finishedAt ?? 0))}</span>
        </div>
        <div className="result">
          <span className="stat-label">Moves</span>
          <span className="result-value mono">{session.moves}</span>
          <span className="help">
            {remaining} more to the exit · shortest {session.optimalMoves}
          </span>
        </div>
      </div>
      {children}
      <p className="help">Close this dialog to study the revealed route.</p>
      <footer className="dialog-footer">
        <div className="footer-left" />
        <div className="footer-right">
          <button className="btn btn-ghost" onClick={onClose}>
            View maze
          </button>
          <button className="btn" onClick={onRetry} title="Replay this maze (R)">
            Retry maze
          </button>
          <button className="btn btn-primary" onClick={onNewMaze} autoFocus>
            New maze
          </button>
        </div>
      </footer>
    </Dialog>
  )
}
