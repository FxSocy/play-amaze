import type { AlgorithmId } from './generators'
import { PORTAL_LAYOUTS, type PortalCount } from './portal'
import { createRng } from './rng'
import type { FogLevel, GameSettings } from './settings'

/**
 * There are three daily mazes: the standard daily, the Daily Doozie, a hard
 * mode that unlocks once the standard one is solved, and the Daily Portal, two
 * mazes cut into sections and linked by portals, with keys, gates, one-way
 * doors and mystery boxes spread across both.
 *
 * The daily maze is a fixed standard so everyone's times are comparable: every
 * difficulty-affecting setting is derived from the date-based seed alone.
 *
 * Changing anything in this file (or the generators) changes past and present
 * daily mazes for every player, so treat these values as frozen. What is frozen
 * is the mapping from a seed to a maze: which calendar date a player is offered
 * is a separate question, answered by their own clock in `dailySeed`.
 */
export type DailyKind = 'daily' | 'doozie' | 'portal'

/**
 * The four ways to play, as the header and the menu offer them: the three
 * dailies everyone shares, and a custom maze of the player's own.
 */
export type GameMode = DailyKind | 'custom'
export const GAME_MODES: readonly GameMode[] = ['daily', 'doozie', 'portal', 'custom']

/** Short names for the mode buttons, where there is no room for "Daily Doozie". */
export const MODE_LABELS: Record<GameMode, string> = {
  daily: 'Daily',
  doozie: 'Doozie',
  portal: 'Portal',
  custom: 'Custom'
}

export const MODE_BLURBS: Record<GameMode, string> = {
  daily: "Today's maze, the same for everyone",
  doozie: 'Hard mode: bigger, and in fog',
  portal: 'Linked mazes: portals are the only way between them',
  custom: 'Your own size, algorithm, fog and hints'
}

interface DailyStandard {
  label: string
  prefix: string
  algorithms: readonly AlgorithmId[]
  width: number
  height: number
  fog: FogLevel
  /** How many linked mazes, for a Portal daily; absent for a plain one. */
  portal?: PortalCount
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
  // Two mazes, each bigger and busier than the single-maze Arcade it replaced:
  // the sections and the trips between them are what there is to think about,
  // so there has to be enough maze on each side for a trip to be a decision.
  // Width and height are one maze's; `portal.ts` owns the full layout. Fog
  // stays off: hiding the maze is the Doozie's job, and a portal you cannot
  // see is a coin flip rather than a decision.
  portal: {
    label: 'Daily Portal',
    prefix: 'PORTAL-',
    algorithms: ['backtracker', 'prims', 'kruskal', 'wilsons'],
    width: PORTAL_LAYOUTS[2].paneWidth,
    height: PORTAL_LAYOUTS[2].paneHeight,
    fog: 'off',
    portal: 2
  }
}

/**
 * The single-maze Daily Arcade that Portal replaced. It is never offered any
 * more, but results and best times saved under its seeds still need a name and
 * settings to be shown with.
 */
const RETIRED_ARCADE: DailyStandard = {
  label: 'Daily Arcade',
  prefix: 'ARCADE-',
  algorithms: ['backtracker', 'prims', 'kruskal', 'wilsons'],
  width: 28,
  height: 18,
  fog: 'off'
}

/** The standard a daily seed was made under, retired ones included. */
function standardFor(seed: string): DailyStandard {
  return seed.startsWith(RETIRED_ARCADE.prefix) ? RETIRED_ARCADE : DAILY_STANDARDS[dailyKind(seed)]
}
export const DAILY_WIDTH = DAILY_STANDARDS.daily.width
export const DAILY_HEIGHT = DAILY_STANDARDS.daily.height

const DAILY_SEED = /^(DAILY|DOOZIE|PORTAL|ARCADE)-(\d{4}-\d{2}-\d{2})$/

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

/** True for standard daily, Daily Doozie and Daily Portal seeds, and the retired Arcade's. */
export function isDailySeed(seed: string): boolean {
  return DAILY_SEED.test(seed)
}

/** Which daily maze a daily seed is for. */
export function dailyKind(seed: string): DailyKind {
  if (seed.startsWith(DAILY_STANDARDS.doozie.prefix)) return 'doozie'
  if (seed.startsWith(DAILY_STANDARDS.portal.prefix)) return 'portal'
  return 'daily'
}

/** "Daily", "Daily Doozie" or "Daily Portal" (or "Daily Arcade", for an old result). */
export function dailyLabel(seed: string): string {
  return standardFor(seed).label
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
  const standard = standardFor(seed)
  return {
    ...base,
    seedMode: 'daily',
    algorithm: createRng(`${seed}:algorithm`).pick(standard.algorithms),
    sizePreset: 'custom',
    customWidth: standard.width,
    customHeight: standard.height,
    fog: standard.fog,
    hints: 0,
    // Portal on a daily comes from DAILY_STANDARDS, not the player's custom
    // setting, so everyone's maze is the same one.
    portal: standard.portal ?? 0
  }
}
