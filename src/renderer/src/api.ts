import type { AmazeApi } from '../../core/api'
import type { Appearance } from '../../core/appearance'
import { canFinishDailyResult, type DailyResult } from '../../core/dailyScore'
import type { TimeRecord } from '../../core/records'
import type { GameSettings } from '../../core/settings'
import { webStorageApi } from '../../core/webStorage'

/** In-memory stand-in used when the page runs outside Electron (e.g. a plain browser). */
function memoryApi(): AmazeApi {
  let defaults: GameSettings | null = null
  let appearance: Appearance | null = null
  const records: TimeRecord[] = []
  const daily = new Map<string, DailyResult>()
  return {
    getDefaults: async () => defaults,
    saveDefaults: async (settings) => {
      defaults = settings
    },
    clearDefaults: async () => {
      defaults = null
    },
    getAppearance: async () => appearance,
    saveAppearance: async (next) => {
      appearance = next
    },
    listRecords: async () => [...records],
    addRecord: async (record) => {
      records.push(record)
    },
    listDailyResults: async () => [...daily.values()],
    startDailyResult: async (result) => {
      const existing = daily.get(result.seed)
      if (existing) return existing
      daily.set(result.seed, result)
      return result
    },
    finishDailyResult: async (result) => {
      const existing = daily.get(result.seed)
      if (!canFinishDailyResult(existing, result)) return existing ?? null
      daily.set(result.seed, result)
      return result
    }
  }
}

/**
 * localStorage when the page runs in a browser. It throws rather than returning
 * null in private modes and wherever site data is blocked, so it is probed
 * before use; the game then falls back to memory and simply forgets on reload.
 */
function localStorageApi(): AmazeApi | null {
  try {
    const probe = 'amaze.probe'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return webStorageApi(window.localStorage)
  } catch (err) {
    console.warn('Browser storage is unavailable; progress will not be saved', err)
    return null
  }
}

export const api: AmazeApi = window.amaze ?? localStorageApi() ?? memoryApi()
