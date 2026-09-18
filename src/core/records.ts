import { dailySettings, isDailySeed } from './daily'
import { randomId } from './rng'
import type { GameSession } from './session'
import { describeModifiers, modifierKey, sanitizeSettings, type GameSettings } from './settings'

export interface TimeRecord {
  id: string
  /** modifierKey() of the settings used; records are only compared within a key. */
  key: string
  settings: GameSettings
  seed: string
  timeMs: number
  moves: number
  optimalMoves: number
  hintsUsed: number
  completedAt: string
}

export function createRecord(session: GameSession): TimeRecord {
  if (!session.solved || session.finishedAt === null) throw new Error('Session was not solved')
  return {
    id: randomId(),
    key: modifierKey(session.settings, session.seed),
    settings: session.settings,
    seed: session.seed,
    timeMs: session.elapsed(session.finishedAt),
    moves: session.moves,
    optimalMoves: session.optimalMoves,
    hintsUsed: session.hintsUsed,
    completedAt: new Date().toISOString()
  }
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Validates untrusted record data; returns null when unusable. */
export function sanitizeRecord(raw: unknown): TimeRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (
    typeof r.id !== 'string' ||
    typeof r.seed !== 'string' ||
    typeof r.completedAt !== 'string' ||
    !isCount(r.timeMs) ||
    !isCount(r.moves) ||
    !isCount(r.optimalMoves) ||
    !isCount(r.hintsUsed)
  ) {
    return null
  }
  let settings = sanitizeSettings(r.settings)
  if (settings.seedMode === 'daily') {
    if (!isDailySeed(r.seed)) return null
    // Daily runs always use the standard daily settings for their date.
    settings = dailySettings(settings, r.seed)
  }
  return {
    id: r.id,
    key: modifierKey(settings, r.seed),
    settings,
    seed: r.seed,
    timeMs: r.timeMs,
    moves: r.moves,
    optimalMoves: r.optimalMoves,
    hintsUsed: r.hintsUsed,
    completedAt: r.completedAt
  }
}

export function bestRecord(records: readonly TimeRecord[], key: string): TimeRecord | null {
  let best: TimeRecord | null = null
  for (const record of records) {
    if (record.key === key && (!best || record.timeMs < best.timeMs)) best = record
  }
  return best
}

export interface RecordGroup {
  key: string
  label: string
  best: TimeRecord
  fewestMoves: number
  runs: number
  lastPlayed: string
}

/** Summarises records per modifier combination, most recently played first. */
export function groupRecords(records: readonly TimeRecord[]): RecordGroup[] {
  const groups = new Map<string, RecordGroup>()
  for (const record of records) {
    const group = groups.get(record.key)
    if (!group) {
      groups.set(record.key, {
        key: record.key,
        label: describeModifiers(record.settings, record.seed),
        best: record,
        fewestMoves: record.moves,
        runs: 1,
        lastPlayed: record.completedAt
      })
      continue
    }
    group.runs++
    if (record.timeMs < group.best.timeMs) group.best = record
    group.fewestMoves = Math.min(group.fewestMoves, record.moves)
    if (record.completedAt > group.lastPlayed) group.lastPlayed = record.completedAt
  }
  return [...groups.values()].sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed))
}

export function formatTime(ms: number): string {
  const totalTenths = Math.floor(ms / 100)
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor(totalTenths / 10) % 60
  const tenths = totalTenths % 10
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
}
