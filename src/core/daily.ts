import type { ArcadeSpec } from './arcade'
import type { AlgorithmId } from './generators'
import { createRng } from './rng'
import type { FogLevel, GameSettings } from './settings'

/**
 * There are three daily mazes: the standard daily, the Daily Doozie, a hard
 * mode that unlocks once the standard one is solved, and the Daily Arcade, a
 * smaller maze strewn with portals, keys, gates and one-way doors.
 *
 * The daily maze is a fixed standard so everyone's times are comparable: every
 * difficulty-affecting setting is derived from the date-based seed alone.
 *
 * Changing anything in this file (or the generators) changes past and present
 * daily mazes for every player, so treat these values as frozen. What is frozen
 * is the mapping from a seed to a maze: which calendar date a player is offered
 * is a separate question, answered by their own clock in `dailySeed`.
 */
export type DailyKind = 'daily' | 'doozie' | 'arcade'

/**
 * The four ways to play, as the header and the menu offer them: the three
 * dailies everyone shares, and a custom maze of the player's own.
 */
export type GameMode = DailyKind | 'custom'
export const GAME_MODES: readonly GameMode[] = ['daily', 'doozie', 'arcade', 'custom']

/** Short names for the mode buttons, where there is no room for "Daily Doozie". */
export const MODE_LABELS: Record<GameMode, string> = {
  daily: 'Daily',
  doozie: 'Doozie',
  arcade: 'Arcade',
  custom: 'Custom'
}

export const MODE_BLURBS: Record<GameMode, string> = {
  daily: "Today's maze, the same for everyone",
  doozie: 'Hard mode: bigger, and in fog',
  arcade: 'Portals, keys, gates and one-way doors',
  custom: 'Your own size, algorithm, fog and hints'
}

interface DailyStandard {
  label: string
  prefix: string
  algorithms: readonly AlgorithmId[]
  width: number
  height: number
  fog: FogLevel
  /** Arcade features to scatter on the maze; absent for a plain daily. */
  arcade?: ArcadeSpec
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
  },
  // Still smaller than the standard daily on purpose: the features, not the
  // distance, are what there is to think about. But a first pass at two of
  // everything played as a plain maze with decorations, so the base standard is
  // denser than that — three gates to plan keys around, three portal pairs to
  // learn, and enough one-way doors that the run home has to be thought about.
  // Fog stays off: hiding the maze is the Doozie's job, and a portal you cannot
  // see is a coin flip rather than a decision.
  arcade: {
    label: 'Daily Arcade',
    prefix: 'ARCADE-',
    algorithms: ['backtracker', 'prims', 'kruskal', 'wilsons'],
    width: 28,
    height: 18,
    fog: 'off',
    // Five boxes rather than four: a bag holds four outcomes, so four boxes
    // would deal exactly one of each every single day.
    arcade: { portalPairs: 3, gates: 3, oneWays: 4, boxes: 5 }
  }
}
export const DAILY_WIDTH = DAILY_STANDARDS.daily.width
export const DAILY_HEIGHT = DAILY_STANDARDS.daily.height

const DAILY_SEED = /^(DAILY|DOOZIE|ARCADE)-(\d{4}-\d{2}-\d{2})$/

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

/** True for standard daily, Daily Doozie and Daily Arcade seeds. */
export function isDailySeed(seed: string): boolean {
  return DAILY_SEED.test(seed)
}

/** Which daily maze a daily seed is for. */
export function dailyKind(seed: string): DailyKind {
  if (seed.startsWith(DAILY_STANDARDS.doozie.prefix)) return 'doozie'
  if (seed.startsWith(DAILY_STANDARDS.arcade.prefix)) return 'arcade'
  return 'daily'
}

/** "Daily", "Daily Doozie" or "Daily Arcade". */
export function dailyLabel(seed: string): string {
  return DAILY_STANDARDS[dailyKind(seed)].label
}

/** The Arcade features a daily seed calls for, or null for a plain maze. */
export function arcadeSpec(seed: string): ArcadeSpec | null {
  return DAILY_STANDARDS[dailyKind(seed)].arcade ?? null
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
    hints: 0,
    // Arcade features on a daily come from DAILY_STANDARDS, not the player's
    // custom setting, so everyone's maze is the same one.
    arcade: 'off'
  }
}
