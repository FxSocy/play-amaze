import type { AlgorithmId } from './generators'
import { createRng } from './rng'
import type { FogLevel, GameSettings } from './settings'

/**
 * There are two daily mazes: the standard daily, and the Daily Doozie, a hard
 * mode that unlocks once the standard one is solved.
 *
 * The daily maze is a fixed standard so everyone's times are comparable: every
 * difficulty-affecting setting is derived from the date-based seed alone.
 *
 * Changing anything in this file (or the generators) changes past and present
 * daily mazes for every player, so treat these values as frozen.
 */
export type DailyKind = 'daily' | 'doozie'

interface DailyStandard {
  label: string
  prefix: string
  algorithms: readonly AlgorithmId[]
  width: number
  height: number
  fog: FogLevel
}

export const DAILY_STANDARDS: Record<DailyKind, DailyStandard> = {
  daily: {
    label: 'Daily',
    prefix: 'DAILY-',
    algorithms: ['backtracker', 'prims', 'kruskal', 'wilsons'],
    width: 30,
    height: 20,
    fog: 'off'
  },
  doozie: {
    label: 'Daily Doozie',
    prefix: 'DOOZIE-',
    algorithms: ['backtracker', 'prims', 'kruskal', 'wilsons'],
    width: 60,
    height: 40,
    fog: 'light'
  }
}
export const DAILY_WIDTH = DAILY_STANDARDS.daily.width
export const DAILY_HEIGHT = DAILY_STANDARDS.daily.height

const DAILY_SEED = /^(DAILY|DOOZIE)-(\d{4}-\d{2}-\d{2})$/

/** Seed for a daily maze. Uses the UTC date so every install agrees regardless of timezone. */
export function dailySeed(date: Date = new Date(), kind: DailyKind = 'daily'): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${DAILY_STANDARDS[kind].prefix}${y}-${m}-${d}`
}

/** True for both standard daily and Daily Doozie seeds. */
export function isDailySeed(seed: string): boolean {
  return DAILY_SEED.test(seed)
}

/** Which daily maze a daily seed is for. */
export function dailyKind(seed: string): DailyKind {
  return seed.startsWith(DAILY_STANDARDS.doozie.prefix) ? 'doozie' : 'daily'
}

/** "Daily" or "Daily Doozie". */
export function dailyLabel(seed: string): string {
  return DAILY_STANDARDS[dailyKind(seed)].label
}

/** "2026-09-17" from "DAILY-2026-09-17" or "DOOZIE-2026-09-17". */
export function dailyDate(seed: string): string {
  return DAILY_SEED.exec(seed)?.[2] ?? seed
}

/** The standard daily seed for the same day as `seed`, e.g. to check the Doozie's unlock. */
export function companionDailySeed(seed: string): string {
  return `${DAILY_STANDARDS.daily.prefix}${dailyDate(seed)}`
}

/**
 * Effective settings for the daily maze with `seed`. Display preferences
 * (breadcrumbs) are kept from `base`; everything that shapes the maze or its
 * difficulty is overridden.
 */
export function dailySettings(base: GameSettings, seed: string): GameSettings {
  const standard = DAILY_STANDARDS[dailyKind(seed)]
  return {
    ...base,
    seedMode: 'daily',
    algorithm: createRng(`${seed}:algorithm`).pick(standard.algorithms),
    sizePreset: 'custom',
    customWidth: standard.width,
    customHeight: standard.height,
    fog: standard.fog,
    hints: 0
  }
}
