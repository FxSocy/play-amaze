import type { AmazeApi } from './api'
import { sanitizeAppearance } from './appearance'
import { canFinishDailyResult, sanitizeDailyResult, type DailyResult } from './dailyScore'
import { sanitizeRecord, type TimeRecord } from './records'
import { sanitizeSettings } from './settings'

/**
 * The browser build's storage: the same `AmazeApi` the Electron app gets over
 * IPC, backed by Web Storage instead of files in the user's data directory.
 * Everything read back is run through the same sanitizers as the desktop store,
 * since site data is trivially editable.
 */

/** Oldest records are dropped beyond this many, matching the desktop store. */
export const MAX_RECORDS = 5000

/** The slice of the Web Storage API this needs, so it can be tested without a DOM. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const STORAGE_KEYS = {
  defaults: 'amaze.defaults',
  appearance: 'amaze.appearance',
  records: 'amaze.records',
  daily: 'amaze.daily'
} as const

export function webStorageApi(store: KeyValueStore): AmazeApi {
  const read = (key: string): unknown => {
    const raw = store.getItem(key)
    if (raw === null) return undefined
    try {
      return JSON.parse(raw)
    } catch (err) {
      console.error(`Ignoring unreadable ${key}`, err)
      return undefined
    }
  }

  // Throws on a full or blocked quota so the caller can log it; the app keeps
  // playing on its in-memory state either way.
  const write = (key: string, data: unknown): void => store.setItem(key, JSON.stringify(data))

  const readRecords = (): TimeRecord[] => {
    const raw = read(STORAGE_KEYS.records)
    if (!Array.isArray(raw)) return []
    return raw.map(sanitizeRecord).filter((r): r is TimeRecord => r !== null)
  }

  /** Scored daily attempts keyed by seed. */
  const readDaily = (): Record<string, DailyResult> => {
    const raw = read(STORAGE_KEYS.daily)
    const results: Record<string, DailyResult> = {}
    if (!Array.isArray(raw)) return results
    for (const item of raw) {
      const result = sanitizeDailyResult(item)
      if (result && !results[result.seed]) results[result.seed] = result
    }
    return results
  }

  return {
    getDefaults: async () => {
      const raw = read(STORAGE_KEYS.defaults)
      return raw === undefined ? null : sanitizeSettings(raw)
    },
    saveDefaults: async (settings) => write(STORAGE_KEYS.defaults, sanitizeSettings(settings)),
    clearDefaults: async () => store.removeItem(STORAGE_KEYS.defaults),

    getAppearance: async () => {
      const raw = read(STORAGE_KEYS.appearance)
      return raw === undefined ? null : sanitizeAppearance(raw)
    },
    saveAppearance: async (appearance) => write(STORAGE_KEYS.appearance, sanitizeAppearance(appearance)),

    listRecords: async () => readRecords(),
    addRecord: async (record) => {
      const clean = sanitizeRecord(record)
      if (!clean) throw new Error('Invalid time record')
      write(STORAGE_KEYS.records, [...readRecords(), clean].slice(-MAX_RECORDS))
    },

    listDailyResults: async () => Object.values(readDaily()),
    startDailyResult: async (result) => {
      const clean = sanitizeDailyResult(result)
      if (!clean || clean.status !== 'started') throw new Error('Invalid daily result')
      const results = readDaily()
      const existing = results[clean.seed]
      if (existing) return existing
      results[clean.seed] = clean
      write(STORAGE_KEYS.daily, Object.values(results))
      return clean
    },
    finishDailyResult: async (result) => {
      const clean = sanitizeDailyResult(result)
      if (!clean) throw new Error('Invalid daily result')
      const results = readDaily()
      const existing = results[clean.seed]
      if (!canFinishDailyResult(existing, clean)) return existing ?? null
      // Only the outcome may change; when the attempt started is fixed.
      const finished = { ...clean, startedAt: existing!.startedAt }
      results[clean.seed] = finished
      write(STORAGE_KEYS.daily, Object.values(results))
      return finished
    }
  }
}
