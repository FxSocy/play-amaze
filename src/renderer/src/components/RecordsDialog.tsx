import { formatTime, groupRecords, type TimeRecord } from '../../../core/records'
import { Dialog } from './Dialog'

interface Props {
  records: readonly TimeRecord[]
  currentKey: string
  onClose: () => void
}

export function RecordsDialog({ records, currentKey, onClose }: Props) {
  const groups = groupRecords(records)
  return (
    <Dialog title="Best times" onClose={onClose}>
      {groups.length === 0 ? (
        <p className="help">No completed mazes yet. Times are grouped by the modifiers you play with.</p>
      ) : (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th>Modifiers</th>
                <th>Best time</th>
                <th>Fewest moves</th>
                <th>Runs</th>
                <th>Last played</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className={g.key === currentKey ? 'current' : ''}>
                  <td>{g.label}</td>
                  <td className="mono">{formatTime(g.best.timeMs)}</td>
                  <td className="mono">{g.fewestMoves}</td>
                  <td className="mono">{g.runs}</td>
                  <td>{new Date(g.lastPlayed).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  )
}
