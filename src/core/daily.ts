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
 * daily mazes for every player, so treat these values as frozen. What is frozen
 * is the mapping from a seed to a maze: which calendar date a player is offered
 * is a separate question, answered by their own clock in `dailySeed`.
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

/**
 * Seed for a daily maze, from the player's own date.
 *
 * The maze itself is not affected: `DAILY-2026-09-18` is the same maze for
 * everyone, and times for a date stay comparable. What the local date decides is
 * *when* a player is offered it — at their midnight, like every other daily
 * puzzle, rather than at 00:00 UTC, which lands mid-morning or mid-evening
 * depending on where they live.
 *
 * The cost is that a player who changes their clock can reach the next day's
 * maze early. Scores are stored per device anyway, so this only lets someone
 * spoil their own puzzle.
 */
export function dailySeed(date: Date = new Date(), kind: DailyKind = 'daily'): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
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
