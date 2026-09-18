import { describe, expect, it } from 'vitest'
import { dailySettings } from './daily'
import { createRecord, formatTime, groupRecords, sanitizeRecord } from './records'
import { GameSession } from './session'
import {
  CUSTOM_SIZE_MAX,
  DEFAULT_SETTINGS,
  describeModifiers,
  modifierKey,
  resolveSize,
  sanitizeSettings
} from './settings'
import { findPath } from './solver'

describe('settings', () => {
  it('falls back to defaults for invalid data', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ algorithm: 'nope', fog: 42, hints: 2 })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps custom sizes', () => {
    const s = sanitizeSettings({ sizePreset: 'custom', customWidth: 10_000, customHeight: 7.6 })
    expect(resolveSize(s)).toEqual({ width: CUSTOM_SIZE_MAX, height: 8 })
  })

  it('defaults to the daily maze with breadcrumbs off', () => {
    expect(DEFAULT_SETTINGS.seedMode).toBe('daily')
    expect(DEFAULT_SETTINGS.breadcrumbs).toBe(false)
    expect(sanitizeSettings({ breadcrumbs: true }).breadcrumbs).toBe(true)
    expect(sanitizeSettings({ breadcrumbs: 'yes' }).breadcrumbs).toBe(false)
  })

  it('keys custom times by the difficulty-affecting modifiers only', () => {
    const base = { ...DEFAULT_SETTINGS, seedMode: 'random' as const }
    const key = modifierKey(base, 'SEED1')
    expect(modifierKey(base, 'OTHER')).toBe(key)
    expect(modifierKey({ ...base, breadcrumbs: true }, 'SEED1')).toBe(key)
    expect(modifierKey({ ...base, fog: 'dense' }, 'SEED1')).not.toBe(key)
    expect(modifierKey({ ...base, hints: 3 }, 'SEED1')).not.toBe(key)
    // A custom size equal to a preset is the same difficulty.
    expect(modifierKey({ ...base, sizePreset: 'custom', customWidth: 30, customHeight: 20 }, 'SEED1')).toBe(key)
  })

  it('keys daily times per day', () => {
    const daily = { ...DEFAULT_SETTINGS, seedMode: 'daily' as const }
    expect(modifierKey(daily, 'DAILY-2026-09-17')).not.toBe(modifierKey(daily, 'DAILY-2026-09-18'))
  })

  it('describes modifiers', () => {
    const custom = { ...DEFAULT_SETTINGS, seedMode: 'random' as const, fog: 'light' as const, hints: 1 as const }
    expect(describeModifiers(custom, 'X')).toBe('Recursive Backtracker · 30×20 · Light fog · 1 hint')
    expect(describeModifiers({ ...DEFAULT_SETTINGS }, 'DAILY-2026-09-17')).toBe(
      'Daily 2026-09-17 · Recursive Backtracker · 30×20'
    )
  })
})

describe('records', () => {
  const finishedSession = (seed: string, step = 10): GameSession => {
    const s = new GameSession({ ...DEFAULT_SETTINGS, seedMode: 'random', sizePreset: 'small' }, seed)
    let now = 0
    for (const cell of findPath(s.maze, s.player, s.maze.end)!.slice(1)) s.moveTo(cell, (now += step))
    return s
  }

  it('creates records from finished sessions and round-trips through sanitize', () => {
    const record = createRecord(finishedSession('r1'))
    expect(record.moves).toBe(record.optimalMoves)
    expect(sanitizeRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
    expect(sanitizeRecord({ ...record, timeMs: -1 })).toBeNull()
  })

  it('refuses to record a run that was given up', () => {
    const s = new GameSession({ ...DEFAULT_SETTINGS, seedMode: 'random', sizePreset: 'small' }, 'quit')
    s.giveUp(10)
    expect(() => createRecord(s)).toThrow()
  })

  it('normalises daily records to the standard daily settings', () => {
    const seed = 'DAILY-2026-09-17'
    const s = new GameSession(dailySettings(DEFAULT_SETTINGS, seed), seed)
    s.begin(0)
    for (const cell of findPath(s.maze, s.player, s.maze.end)!.slice(1)) s.moveTo(cell, 1)
    const record = createRecord(s)
    const tampered = { ...record, settings: { ...record.settings, fog: 'dense', hints: 5 } }
    expect(sanitizeRecord(tampered)).toEqual(record)
    expect(sanitizeRecord({ ...record, seed: 'NOT-A-DAY' })).toBeNull()
  })

  it('groups records by modifiers and finds the best', () => {
    const fast = createRecord(finishedSession('a', 5))
    const slow = createRecord(finishedSession('b', 50))
    const groups = groupRecords([slow, fast])
    expect(groups).toHaveLength(1)
    expect(groups[0].runs).toBe(2)
    expect(groups[0].best.id).toBe(fast.id)
  })

  it('formats times as m:ss.t', () => {
    expect(formatTime(0)).toBe('0:00.0')
    expect(formatTime(61_234)).toBe('1:01.2')
  })
})
