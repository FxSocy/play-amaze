import { dailyDate, dailyLabel, isDailySeed } from './daily'
import { formatTime } from './records'
import type { GameSession } from './session'

/**
 * The player's scored attempt at one day's maze. Only the first attempt counts:
 * it is created the moment the player presses Start (before the maze is
 * visible) and can afterwards only move from 'started' to a final status, once.
 * Practice runs after that never touch it.
 */
export interface DailyResult {
  seed: string
  /** Identifies the session that owns this result, so a practice run can't finish it. */
  attemptId: string
  startedAt: string
  /**
   * 'started' while the run is in progress. A 'started' result that no live
   * session owns (the player left the run or closed the app) did not finish.
   */
  status: 'started' | 'solved' | 'gave-up'
  timeMs: number | null
  moves: number | null
}

export type DailyOutcome = 'in-progress' | 'solved' | 'did-not-finish'

export function startDailyResult(seed: string, attemptId: string, startedAt: Date = new Date()): DailyResult {
  return { seed, attemptId, startedAt: startedAt.toISOString(), status: 'started', timeMs: null, moves: null }
}

/** The final result for a finished session that owns `started`. */
export function finishDailyResult(started: DailyResult, session: GameSession): DailyResult {
  if (!session.finished || session.finishedAt === null) throw new Error('Session is not finished')
  return {
    ...started,
    status: session.gaveUp ? 'gave-up' : 'solved',
    timeMs: session.elapsed(session.finishedAt),
    moves: session.moves
  }
}

/** Whether `next` is a legal update of `current`: same attempt, and only from 'started' to a final status. */
export function canFinishDailyResult(current: DailyResult | undefined, next: DailyResult): boolean {
  return (
    current !== undefined &&
    current.status === 'started' &&
    next.status !== 'started' &&
    current.seed === next.seed &&
    current.attemptId === next.attemptId
  )
}

/** `ownedByLiveSession`: the attempt belongs to a session that is still running in this app. */
export function dailyOutcome(result: DailyResult, ownedByLiveSession: boolean): DailyOutcome {
  if (result.status === 'solved') return 'solved'
  if (result.status === 'started' && ownedByLiveSession) return 'in-progress'
  return 'did-not-finish'
}

/**
 * Score for a solved daily maze: seconds × moves, truncated. Lower is better.
 * Uses the time at the tenth-of-a-second precision it's displayed with, so
 * anyone can check a shared score from its time and moves.
 */
export function dailyPoints(timeMs: number, moves: number): number {
  return Math.floor((Math.floor(timeMs / 100) * moves) / 10)
}

/** Where a shared score sends everyone else to play the same maze. */
export const PLAY_URL = 'https://fxsocy.github.io/play-amaze/'

export function dailyShareText(result: DailyResult, outcome: DailyOutcome): string {
  const title = `Amaze ${dailyLabel(result.seed)} ${dailyDate(result.seed)}`
  // The link goes last, on its own line, so chat apps make it a clickable preview.
  if (outcome !== 'solved' || result.timeMs === null || result.moves === null) {
    return [title, '❌ Did not finish', PLAY_URL].join('\n')
  }
  return [
    title,
    `⏱️ ${formatTime(result.timeMs)} · 👣 ${result.moves} moves`,
    `🏆 ${dailyPoints(result.timeMs, result.moves)} pts`,
    PLAY_URL
  ].join('\n')
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isCountOrNull = (v: unknown): v is number | null => v === null || isCount(v)

/** Validates untrusted daily result data; returns null when unusable. */
export function sanitizeDailyResult(raw: unknown): DailyResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (
    typeof r.seed !== 'string' ||
    !isDailySeed(r.seed) ||
    typeof r.attemptId !== 'string' ||
    typeof r.startedAt !== 'string' ||
    (r.status !== 'started' && r.status !== 'solved' && r.status !== 'gave-up') ||
    !isCountOrNull(r.timeMs) ||
    !isCountOrNull(r.moves)
  ) {
    return null
  }
  if (r.status === 'solved' && (r.timeMs === null || r.moves === null)) return null
  return {
    seed: r.seed,
    attemptId: r.attemptId,
    startedAt: r.startedAt,
    status: r.status,
    timeMs: r.timeMs,
    moves: r.moves
  }
}
