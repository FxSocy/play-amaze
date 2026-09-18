import { afterEach, describe, expect, it } from 'vitest'
import { randomId, randomSeed } from './rng'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const realCrypto = globalThis.crypto
const useCrypto = (value: unknown): void => {
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true })
}
afterEach(() => useCrypto(realCrypto))

/**
 * A page served over plain HTTP is not a secure context: crypto.randomUUID is
 * missing there, and reaching for it while saving a finished run used to throw
 * inside a React effect and blank the whole app.
 */
describe('random ids without a secure context', () => {
  it('produces v4 UUIDs when crypto.randomUUID exists', () => {
    expect(randomId()).toMatch(UUID)
  })

  it('falls back to random bytes when randomUUID is missing', () => {
    useCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) })
    const ids = new Set(Array.from({ length: 100 }, randomId))
    expect([...ids].every((id) => UUID.test(id))).toBe(true)
    expect(ids.size).toBe(100)
    expect(randomSeed()).toMatch(/^[0-9A-Z]{7}$/)
  })

  it('still works with no crypto at all', () => {
    useCrypto(undefined)
    expect(randomId()).toMatch(UUID)
    expect(new Set(Array.from({ length: 50 }, randomId)).size).toBe(50)
    expect(randomSeed()).toMatch(/^[0-9A-Z]{7}$/)
  })
})
