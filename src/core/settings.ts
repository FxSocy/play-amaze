import { ARCADE_LABELS, ARCADE_LEVELS, type ArcadeLevel } from './arcade'
import { dailyDate, dailyLabel } from './daily'
import { ALGORITHM_IDS, GENERATORS, type AlgorithmId } from './generators'

export type SizePresetId = 'small' | 'medium' | 'large' | 'huge' | 'custom'
export type FogLevel = 'off' | 'light' | 'dense'
export type SeedMode = 'random' | 'daily'
export type HintCount = 0 | 1 | 3 | 5

export interface GameSettings {
  algorithm: AlgorithmId
  sizePreset: SizePresetId
  customWidth: number
  customHeight: number
  /** 'daily' plays the shared standard daily maze; the other maze settings are ignored. */
  seedMode: SeedMode
  fog: FogLevel
  /** Hints available per maze; 0 disables the hint modifier. */
  hints: HintCount
  /**
   * Arcade features on a custom maze: portals, keys, gates, one-way doors and
   * wall-break charges. The daily mazes set their own and ignore this.
   */
  arcade: ArcadeLevel
  /** Display preference: draw the passages already walked. */
  breadcrumbs: boolean
}

export const SIZE_PRESETS: Record<Exclude<SizePresetId, 'custom'>, { label: string; width: number; height: number }> = {
  small: { label: 'Small', width: 15, height: 10 },
  medium: { label: 'Medium', width: 30, height: 20 },
  large: { label: 'Large', width: 50, height: 32 },
  huge: { label: 'Huge', width: 90, height: 56 }
}
export const SIZE_PRESET_IDS: SizePresetId[] = ['small', 'medium', 'large', 'huge', 'custom']

export const CUSTOM_SIZE_MIN = 5
export const CUSTOM_SIZE_MAX = 200

/** Vision radius in walking steps through open passages. */
export const FOG_LEVELS: Record<FogLevel, { label: string; radius: number }> = {
  off: { label: 'Off', radius: Infinity },
  light: { label: 'Light', radius: 6 },
  dense: { label: 'Dense', radius: 3 }
}
export const FOG_LEVEL_IDS: FogLevel[] = ['off', 'light', 'dense']

export const HINT_OPTIONS: HintCount[] = [0, 1, 3, 5]
export const SEED_MODES: SeedMode[] = ['random', 'daily']

export const DEFAULT_SETTINGS: Readonly<GameSettings> = {
  algorithm: 'backtracker',
  sizePreset: 'medium',
  customWidth: 40,
  customHeight: 25,
  seedMode: 'daily',
  fog: 'off',
  hints: 0,
  arcade: 'off',
  breadcrumbs: true
}

export function resolveSize(settings: GameSettings): { width: number; height: number } {
  if (settings.sizePreset === 'custom') {
    return { width: settings.customWidth, height: settings.customHeight }
  }
  const { width, height } = SIZE_PRESETS[settings.sizePreset]
  return { width, height }
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function clampSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(CUSTOM_SIZE_MAX, Math.max(CUSTOM_SIZE_MIN, Math.round(value)))
}

/** Coerces untrusted data (saved JSON, IPC payloads) into valid settings. */
export function sanitizeSettings(raw: unknown): GameSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    algorithm: oneOf(src.algorithm, ALGORITHM_IDS, d.algorithm),
    sizePreset: oneOf(src.sizePreset, SIZE_PRESET_IDS, d.sizePreset),
    customWidth: clampSize(src.customWidth, d.customWidth),
    customHeight: clampSize(src.customHeight, d.customHeight),
    seedMode: oneOf(src.seedMode, SEED_MODES, d.seedMode),
    fog: oneOf(src.fog, FOG_LEVEL_IDS, d.fog),
    hints: oneOf(src.hints, HINT_OPTIONS, d.hints),
    arcade: oneOf(src.arcade, ARCADE_LEVELS, d.arcade),
    breadcrumbs: typeof src.breadcrumbs === 'boolean' ? src.breadcrumbs : d.breadcrumbs
  }
}

/**
 * Groups comparable runs. Daily mazes are compared per day; custom runs are
 * compared by the modifiers that affect difficulty. Breadcrumbs are a display
 * preference and don't split the leaderboard.
 */
export function modifierKey(settings: GameSettings, seed: string): string {
  if (settings.seedMode === 'daily') return `daily|${seed}`
  const { width, height } = resolveSize(settings)
  return `${settings.algorithm}|${width}x${height}|fog:${settings.fog}|hints:${settings.hints}|arcade:${settings.arcade}`
}

export function describeModifiers(settings: GameSettings, seed: string): string {
  const { width, height } = resolveSize(settings)
  const parts = [GENERATORS[settings.algorithm].name, `${width}×${height}`]
  if (settings.seedMode === 'daily') parts.unshift(`${dailyLabel(seed)} ${dailyDate(seed)}`)
  if (settings.fog !== 'off') parts.push(`${FOG_LEVELS[settings.fog].label} fog`)
  if (settings.hints > 0) parts.push(`${settings.hints} hint${settings.hints === 1 ? '' : 's'}`)
  if (settings.arcade !== 'off') parts.push(`${ARCADE_LABELS[settings.arcade]} arcade`)
  return parts.join(' · ')
}
