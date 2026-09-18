import type { ReactNode } from 'react'
import { formatTime, type TimeRecord } from '../../../core/records'
import { describeModifiers } from '../../../core/settings'
import { Dialog } from './Dialog'

interface Props {
  record: TimeRecord
  /** Best time for the same modifiers before this run, if any. */
  previousBest: TimeRecord | null
  onRetry: () => void
  onNewMaze: () => void
  onClose: () => void
  /** Extra content shown below the results, e.g. the daily score. */
  children?: ReactNode
}

export function FinishDialog({ record, previousBest, onRetry, onNewMaze, onClose, children }: Props) {
  const isBest = !previousBest || record.timeMs < previousBest.timeMs
  return (
    <Dialog title="Maze solved" onClose={onClose}>
      <p className="help">{describeModifiers(record.settings, record.seed)}</p>
      <div className="results">
        <div className="result">
          <span className="stat-label">Time</span>
          <span className="result-value mono">{formatTime(record.timeMs)}</span>
          <span className={isBest ? 'badge' : 'help'}>
            {isBest ? 'New best' : `Best ${formatTime(previousBest!.timeMs)}`}
          </span>
        </div>
        <div className="result">
          <span className="stat-label">Moves</span>
          <span className="result-value mono">{record.moves}</span>
          <span className="help">Shortest {record.optimalMoves}</span>
        </div>
        {record.settings.hints > 0 && (
          <div className="result">
            <span className="stat-label">Hints used</span>
            <span className="result-value mono">
              {record.hintsUsed}/{record.settings.hints}
            </span>
          </div>
        )}
      </div>
      {children}
      <footer className="dialog-footer">
        <div className="footer-left" />
        <div className="footer-right">
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
