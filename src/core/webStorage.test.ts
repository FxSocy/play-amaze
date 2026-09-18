import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE } from './appearance'
import { startDailyResult, type DailyResult } from './dailyScore'
import type { TimeRecord } from './records'
import { DEFAULT_SETTINGS } from './settings'
import { MAX_RECORDS, STORAGE_KEYS, webStorageApi, type KeyValueStore } from './webStorage'

/** Stands in for localStorage, including its string-only values. */
function fakeStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key)
  }
}

const record = (patch: Partial<TimeRecord> = {}): TimeRecord => ({
  id: 'r1',
  key: 'daily|DAILY-2026-09-17',
  settings: { ...DEFAULT_SETTINGS, seedMode: 'daily' },
  seed: 'DAILY-2026-09-17',
  timeMs: 45300,
  moves: 120,
  optimalMoves: 100,
  hintsUsed: 0,
  completedAt: '2026-09-17T12:00:00.000Z',
  ...patch
})

describe('webStorageApi', () => {
  it('keeps settings, appearance and records across a reload', async () => {
    const store = fakeStore()
    const api = webStorageApi(store)
    await api.saveDefaults({ ...DEFAULT_SETTINGS, fog: 'dense' })
    await api.saveAppearance({ ...DEFAULT_APPEARANCE, theme: 'tokyo-night' })
    await api.addRecord(record())

    // A fresh api over the same storage is what a page reload gets.
    const reloaded = webStorageApi(store)
    expect((await reloaded.getDefaults())?.fog).toBe('dense')
    expect((await reloaded.getAppearance())?.theme).toBe('tokyo-night')
    expect(await reloaded.listRecords()).toHaveLength(1)

    await reloaded.clearDefaults()
    expect(await webStorageApi(store).getDefaults()).toBeNull()
  })

  it('returns nothing rather than throwing on corrupt or hostile site data', async () => {
    const store = fakeStore()
    store.setItem(STORAGE_KEYS.defaults, '{ not json')
    store.setItem(STORAGE_KEYS.appearance, 'null')
    store.setItem(STORAGE_KEYS.records, JSON.stringify(['nonsense', record(), { id: 7 }]))
    store.setItem(STORAGE_KEYS.daily, '"not an array"')
    const api = webStorageApi(store)

    expect(await api.getDefaults()).toBeNull()
    // Anything parseable is still run through the sanitizers.
    expect((await api.getAppearance())?.theme).toBe(DEFAULT_APPEARANCE.theme)
    expect(await api.listRecords()).toHaveLength(1)
    expect(await api.listDailyResults()).toEqual([])
  })

  it('refuses invalid records and caps how many are kept', async () => {
    const store = fakeStore()
    const api = webStorageApi(store)
    // Site data is editable, so the api validates even what the types promise.
    await expect(api.addRecord({ id: 'nope' } as unknown as TimeRecord)).rejects.toThrow()

    const existing = Array.from({ length: MAX_RECORDS }, (_, i) => record({ id: `old-${i}` }))
    store.setItem(STORAGE_KEYS.records, JSON.stringify(existing))
    await api.addRecord(record({ id: 'newest' }))

    const kept = await api.listRecords()
    expect(kept).toHaveLength(MAX_RECORDS)
    expect(kept[kept.length - 1].id).toBe('newest')
    // The oldest is the one dropped.
    expect(kept.some((r) => r.id === 'old-0')).toBe(false)
  })

  it('scores only the first daily attempt, and only the session that started it', async () => {
    const store = fakeStore()
    const api = webStorageApi(store)
    const first = startDailyResult('DAILY-2026-09-17', 'attempt-1', new Date('2026-09-17T10:00:00Z'))
    expect(await api.startDailyResult(first)).toEqual(first)

    // A later run the same day is practice: the stored attempt is handed back unchanged.
    const second = startDailyResult('DAILY-2026-09-17', 'attempt-2', new Date('2026-09-17T11:00:00Z'))
    expect(await api.startDailyResult(second)).toEqual(first)

    const finish = (from: DailyResult): DailyResult => ({ ...from, status: 'solved', timeMs: 45300, moves: 120 })
    expect(await api.finishDailyResult(finish(second))).toEqual(first)

    const solved = await api.finishDailyResult(finish(first))
    expect(solved).toMatchObject({ status: 'solved', timeMs: 45300, moves: 120, startedAt: first.startedAt })
    // Finished results are final.
    expect(await api.finishDailyResult({ ...finish(first), moves: 1 })).toEqual(solved)
    expect(await webStorageApi(store).listDailyResults()).toEqual([solved])
  })
})
