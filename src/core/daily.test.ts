import { describe, expect, it } from 'vitest'
import {
  companionDailySeed,
  dailyDate,
  dailyKind,
  dailyLabel,
  dailySeed,
  dailySettings,
  DAILY_HEIGHT,
  DAILY_STANDARDS,
  DAILY_WIDTH,
  isDailySeed
} from './daily'
import { hashString } from './rng'
import { GameSession } from './session'
import { DEFAULT_SETTINGS, describeModifiers, modifierKey, resolveSize, type GameSettings } from './settings'

const custom: GameSettings = {
  ...DEFAULT_SETTINGS,
  seedMode: 'random',
  algorithm: 'wilsons',
  sizePreset: 'huge',
  fog: 'dense',
  hints: 5,
  breadcrumbs: true
}

/** Runs `fn` as if the machine were somewhere else. */
function withTimeZone<T>(timeZone: string, fn: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = timeZone
  try {
    return fn()
  } finally {
    process.env.TZ = previous
  }
}

const GOLDEN = {
  'DAILY-2026-09-17': { algorithm: 'prims', start: 89, end: 299, walls: 2916307200 },
  'DAILY-2027-01-01': { algorithm: 'wilsons', start: 570, end: 180, walls: 3026782561 },
  'DOOZIE-2026-09-17': { algorithm: 'backtracker', start: 1162, end: 1391, walls: 3464784565 },
  'DOOZIE-2027-01-01': { algorithm: 'kruskal', start: 41, end: 380, walls: 35028979 }
}

describe('daily maze', () => {
  it("derives the seed from the player's own date", () => {
    // Local components in, local date out, wherever this runs.
    expect(dailySeed(new Date(2026, 8, 17, 0, 30))).toBe('DAILY-2026-09-17')
    expect(dailySeed(new Date(2026, 8, 17, 23, 59, 59))).toBe('DAILY-2026-09-17')
    expect(dailySeed(new Date(2026, 8, 18, 0, 0, 0))).toBe('DAILY-2026-09-18')
  })

  it('rolls over at local midnight, not at 00:00 UTC', () => {
    // One instant, read from two places: 02:00 UTC is still the 17th in New York
    // and already the 18th in Tokyo, and each player gets their own day's maze.
    const instant = new Date('2026-09-18T02:00:00Z')
    expect(withTimeZone('America/New_York', () => dailySeed(instant))).toBe('DAILY-2026-09-17')
    expect(withTimeZone('Asia/Tokyo', () => dailySeed(instant))).toBe('DAILY-2026-09-18')
    expect(withTimeZone('Asia/Tokyo', () => dailySeed(instant, 'doozie'))).toBe('DOOZIE-2026-09-18')
  })

  it('gives every player the same maze for a given date', () => {
    // The point of local rollover is when a maze appears, not which maze it is.
    const fingerprint = (tz: string): unknown =>
      withTimeZone(tz, () => {
        const seed = dailySeed(new Date('2026-09-18T02:00:00Z'))
        const session = new GameSession(dailySettings(DEFAULT_SETTINGS, 'DAILY-2026-09-17'), 'DAILY-2026-09-17')
        return { seed, start: session.maze.start, end: session.maze.end, walls: hashString(session.maze.walls.join('')) }
      })
    const newYork = fingerprint('America/New_York') as { seed: string }
    const tokyo = fingerprint('Asia/Tokyo') as { seed: string }
    expect(newYork.seed).not.toBe(tokyo.seed)
    expect({ ...newYork, seed: null }).toEqual({ ...tokyo, seed: null })
  })

  it('recognises daily seeds', () => {
    expect(isDailySeed('DAILY-2026-09-17')).toBe(true)
    expect(isDailySeed('K3F9Q2A')).toBe(false)
    expect(dailyDate('DAILY-2026-09-17')).toBe('2026-09-17')
  })

  it("ignores the player's maze settings so everyone gets the same standard maze", () => {
    const seed = 'DAILY-2026-09-17'
    const fromCustom = dailySettings(custom, seed)
    const fromDefaults = dailySettings(DEFAULT_SETTINGS, seed)
    expect({ ...fromCustom, breadcrumbs: false }).toEqual(fromDefaults)
    expect(fromCustom.seedMode).toBe('daily')
    expect(fromCustom.fog).toBe('off')
    expect(fromCustom.hints).toBe(0)
    expect(resolveSize(fromCustom)).toEqual({ width: DAILY_WIDTH, height: DAILY_HEIGHT })
    // Display preferences survive.
    expect(fromCustom.breadcrumbs).toBe(true)

    const a = new GameSession(fromCustom, seed)
    const b = new GameSession(fromDefaults, seed)
    expect(a.maze).toEqual(b.maze)
  })

  it('varies the algorithm across days', () => {
    const algorithms = new Set<string>()
    for (let day = 1; day <= 28; day++) {
      const seed = `DAILY-2026-02-${String(day).padStart(2, '0')}`
      algorithms.add(dailySettings(DEFAULT_SETTINGS, seed).algorithm)
    }
    expect(algorithms.size).toBeGreaterThan(1)
  })

  // Golden values: if these change, every player's daily maze for past and
  // future dates changes too. Only update them deliberately.
  it.each([
    ['DAILY-2026-09-17', GOLDEN['DAILY-2026-09-17']],
    ['DAILY-2027-01-01', GOLDEN['DAILY-2027-01-01']],
    ['DOOZIE-2026-09-17', GOLDEN['DOOZIE-2026-09-17']],
    ['DOOZIE-2027-01-01', GOLDEN['DOOZIE-2027-01-01']]
  ])('produces a stable maze for %s', (seed, expected) => {
    const s = new GameSession(dailySettings(DEFAULT_SETTINGS, seed), seed)
    const fingerprint = {
      algorithm: s.settings.algorithm,
      start: s.maze.start,
      end: s.maze.end,
      walls: hashString(Array.from(s.maze.walls).join(','))
    }
    expect(fingerprint).toEqual(expected)
  })
})

describe('Daily Doozie', () => {
  const date = new Date('2026-09-17T12:00:00Z')

  it('has its own seed for the same day', () => {
    const seed = dailySeed(date, 'doozie')
    expect(seed).toBe('DOOZIE-2026-09-17')
    expect(isDailySeed(seed)).toBe(true)
    expect(isDailySeed('DOOZIE-26-9-17')).toBe(false)
    expect(dailyKind(seed)).toBe('doozie')
    expect(dailyKind(dailySeed(date))).toBe('daily')
    expect(dailyDate(seed)).toBe('2026-09-17')
    expect(dailyLabel(seed)).toBe('Daily Doozie')
    expect(companionDailySeed(seed)).toBe('DAILY-2026-09-17')
  })

  it('is a harder standard than the daily maze, independent of player settings', () => {
    const seed = dailySeed(date, 'doozie')
    const doozie = dailySettings(custom, seed)
    expect({ ...doozie, breadcrumbs: false }).toEqual(dailySettings(DEFAULT_SETTINGS, seed))
    expect(resolveSize(doozie)).toEqual({ width: DAILY_STANDARDS.doozie.width, height: DAILY_STANDARDS.doozie.height })
    expect(DAILY_STANDARDS.doozie.width * DAILY_STANDARDS.doozie.height).toBeGreaterThan(DAILY_WIDTH * DAILY_HEIGHT)
    expect(doozie.fog).not.toBe('off')
    expect(doozie.hints).toBe(0)
    expect(describeModifiers(doozie, seed)).toMatch(/^Daily Doozie 2026-09-17 · /)
  })

  it('keeps separate best times from the daily maze', () => {
    const daily = dailySeed(date)
    const doozie = dailySeed(date, 'doozie')
    expect(modifierKey(dailySettings(DEFAULT_SETTINGS, doozie), doozie)).not.toBe(
      modifierKey(dailySettings(DEFAULT_SETTINGS, daily), daily)
    )
  })
})
