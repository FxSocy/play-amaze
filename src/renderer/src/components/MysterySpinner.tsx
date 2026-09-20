import {
  MYSTERY_BLURBS,
  MYSTERY_ICONS,
  MYSTERY_IS_GOOD,
  MYSTERY_LABELS,
  MYSTERY_OUTCOMES,
  type MysteryOutcome
} from '../../../core/arcade'
import type { MysterySpin } from '../../../core/session'

/** How many times the reel cycles the four outcomes before landing. */
const LOOPS = 6
/** Reel row height in px; the CSS has to agree with this to land on the right row. */
const ROW = 84

/**
 * The reel that opens a mystery box, over the maze, for exactly as long as the
 * session says the run is frozen.
 *
 * The outcome is already decided — by the seed, when the maze was made — so
 * this is a picture of a result rather than a draw. That also means it can be
 * animated by CSS alone: the reel's final position is known up front, so it
 * eases from a long way above to exactly the winning row and rests there, which
 * is also what leaves the right thing on screen when a player has asked their
 * system for less motion.
 */
export function MysterySpinner({ spin }: { spin: MysterySpin }) {
  const landed = MYSTERY_OUTCOMES.indexOf(spin.outcome)
  const rows: MysteryOutcome[] = []
  for (let loop = 0; loop < LOOPS; loop++) rows.push(...MYSTERY_OUTCOMES)
  rows.push(...MYSTERY_OUTCOMES.slice(0, landed + 1))
  const finalRow = LOOPS * MYSTERY_OUTCOMES.length + landed

  return (
    <div className="mystery-overlay" role="status" aria-live="polite">
      <div className={MYSTERY_IS_GOOD[spin.outcome] ? 'mystery-card good' : 'mystery-card bad'}>
        <span className="mystery-title">? box</span>
        <div className="mystery-window" style={{ height: ROW }}>
          <div
            className="mystery-reel"
            style={{ transform: `translateY(${-finalRow * ROW}px)`, ['--reel-rows' as string]: rows.length }}
          >
            {rows.map((outcome, index) => (
              <div className="mystery-row" key={index} style={{ height: ROW }}>
                <span className="mystery-icon" aria-hidden="true">
                  {MYSTERY_ICONS[outcome]}
                </span>
                <span className="mystery-label">{MYSTERY_LABELS[outcome]}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mystery-blurb">{MYSTERY_BLURBS[spin.outcome]}</p>
      </div>
    </div>
  )
}
