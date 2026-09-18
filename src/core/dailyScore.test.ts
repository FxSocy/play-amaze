import { describe, expect, it } from 'vitest'
import { dailySettings } from './daily'
import {
  canFinishDailyResult,
  dailyOutcome,
  dailyPoints,
  dailyShareText,
  finishDailyResult,
  sanitizeDailyResult,
  startDailyResult
} from './dailyScore'
import { GameSession } from './session'
import { DEFAULT_SETTINGS } from './settings'
import { findPath } from './solver'

const SEED = 'DAILY-2026-09-17'

function playDaily(finish: 'solve' | 'give-up'): GameSession {
  const s = new GameSession(dailySettings(DEFAULT_SETTINGS, SEED), SEED)
  s.begin(1000)
  const path = findPath(s.maze, s.player, s.maze.end)!
  if (finish === 'give-up') {
    s.moveTo(path[1], 1500)
    s.giveUp(4000)
    return s
  }
  let now = 1000
  for (const cell of path.slice(1)) s.moveTo(cell, (now += 250))
  return s
}

describe('daily score', () => {
  it('multiplies seconds (to the displayed tenth) by moves and truncates', () => {
    expect(dailyPoints(45_300, 120)).toBe(5436)
    expect(dailyPoints(45_399, 120)).toBe(5436)
    expect(dailyPoints(12_345, 7)).toBe(86) // 12.3 × 7 = 86.1
    expect(dailyPoints(0, 50)).toBe(0)
  })

  it('records a solved first attempt', () => {
    const s = playDaily('solve')
    const started = startDailyResult(SEED, 'a1', new Date('2026-09-17T10:00:00Z'))
    const result = finishDailyResult(started, s)
    expect(result).toMatchObject({ status: 'solved', attemptId: 'a1', moves: s.optimalMoves })
    expect(result.timeMs).toBe(s.optimalMoves * 250)
    expect(dailyOutcome(result, false)).toBe('solved')
  })

  it('treats give-ups and abandoned attempts as did not finish', () => {
    const started = startDailyResult(SEED, 'a1')
    expect(dailyOutcome(started, true)).toBe('in-progress')
    expect(dailyOutcome(started, false)).toBe('did-not-finish')
    const gaveUp = finishDailyResult(started, playDaily('give-up'))
    expect(gaveUp.status).toBe('gave-up')
    expect(dailyOutcome(gaveUp, true)).toBe('did-not-finish')
  })

  it('only lets the owning attempt finish a started result, once', () => {
    const started = startDailyResult(SEED, 'a1')
    const solved = finishDailyResult(started, playDaily('solve'))
    expect(canFinishDailyResult(undefined, solved)).toBe(false)
    expect(canFinishDailyResult(started, solved)).toBe(true)
    expect(canFinishDailyResult(started, { ...solved, attemptId: 'practice' })).toBe(false)
    expect(canFinishDailyResult(solved, { ...solved, timeMs: 1, moves: 1 })).toBe(false)
    expect(canFinishDailyResult(started, started)).toBe(false)
  })

  it('builds shareable text', () => {
    const result = { ...startDailyResult(SEED, 'a1'), status: 'solved' as const, timeMs: 45_300, moves: 120 }
    expect(dailyShareText(result, 'solved')).toBe('Amaze Daily 2026-09-17\n⏱️ 0:45.3 · 👣 120 moves\n🏆 5436 pts')
    expect(dailyShareText(startDailyResult(SEED, 'a1'), 'did-not-finish')).toBe(
      'Amaze Daily 2026-09-17\n❌ Did not finish'
    )
    expect(dailyShareText({ ...result, seed: 'DOOZIE-2026-09-17' }, 'solved')).toMatch(
      /^Amaze Daily Doozie 2026-09-17\n/
    )
  })

  it('sanitizes stored results', () => {
    const result = finishDailyResult(startDailyResult(SEED, 'a1'), playDaily('solve'))
    expect(sanitizeDailyResult(JSON.parse(JSON.stringify(result)))).toEqual(result)
    expect(sanitizeDailyResult({ ...result, seed: 'DOOZIE-2026-09-17' })?.seed).toBe('DOOZIE-2026-09-17')
    expect(sanitizeDailyResult({ ...result, seed: 'K3F9Q2A' })).toBeNull()
    expect(sanitizeDailyResult({ ...result, status: 'won' })).toBeNull()
    expect(sanitizeDailyResult({ ...result, timeMs: null })).toBeNull()
    expect(sanitizeDailyResult(null)).toBeNull()
  })
})
