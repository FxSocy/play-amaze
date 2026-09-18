import type { Appearance } from './appearance'
import type { DailyResult } from './dailyScore'
import type { TimeRecord } from './records'
import type { GameSettings } from './settings'

/** Bridge exposed by the preload script as `window.amaze`. */
export interface AmazeApi {
  /** Saved default settings, or null if the user never saved any. */
  getDefaults(): Promise<GameSettings | null>
  saveDefaults(settings: GameSettings): Promise<void>
  clearDefaults(): Promise<void>
  /** Saved cosmetic preferences, or null if the user never changed any. */
  getAppearance(): Promise<Appearance | null>
  saveAppearance(appearance: Appearance): Promise<void>
  listRecords(): Promise<TimeRecord[]>
  addRecord(record: TimeRecord): Promise<void>
  listDailyResults(): Promise<DailyResult[]>
  /**
   * Claims `result` as the scored attempt for its day. If that day already has
   * one, it is kept unchanged. Resolves to whichever result is now stored.
   */
  startDailyResult(result: DailyResult): Promise<DailyResult>
  /**
   * Finalises the stored attempt for the day. Ignored unless the stored result
   * is still 'started' by the same attempt. Resolves to the stored result.
   */
  finishDailyResult(result: DailyResult): Promise<DailyResult | null>
}

export const IPC = {
  getDefaults: 'defaults:get',
  saveDefaults: 'defaults:save',
  clearDefaults: 'defaults:clear',
  getAppearance: 'appearance:get',
  saveAppearance: 'appearance:save',
  listRecords: 'records:list',
  addRecord: 'records:add',
  listDailyResults: 'daily:list',
  startDailyResult: 'daily:start',
  finishDailyResult: 'daily:finish'
} as const
