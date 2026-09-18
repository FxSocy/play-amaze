import { describe, expect, it } from 'vitest'
import { createRng, hashString, randomSeed } from './rng'

describe('rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed')
    const b = createRng('seed')
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(Array.from({ length: 50 }, () => b.next()))
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-a')
    const b = createRng('seed-b')
    expect(Array.from({ length: 10 }, () => a.next())).not.toEqual(Array.from({ length: 10 }, () => b.next()))
  })

  it('keeps values in range', () => {
    const rng = createRng('range')
    for (let i = 0; i < 1000; i++) {
      const f = rng.next()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      const n = rng.int(7)
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true)
    }
  })

  it('shuffles into a permutation', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const shuffled = createRng('shuffle').shuffle([...items])
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items)
    expect(shuffled).not.toEqual(items)
  })

  it('hashes to unsigned 32-bit integers', () => {
    const h = hashString('anything')
    expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true)
  })

  it('generates short alphanumeric random seeds', () => {
    expect(randomSeed()).toMatch(/^[0-9A-Z]{7}$/)
  })
})
