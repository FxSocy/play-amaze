/** Deterministic pseudorandom number generation seeded from strings. */

export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [0, max). */
  int(max: number): number
  pick<T>(items: readonly T[]): T
  /** Fisher-Yates shuffle in place; returns the same array. */
  shuffle<T>(items: T[]): T[]
}

/** cyrb53-style string hash folded to 32 bits, used to derive PRNG state from a seed string. */
export function hashString(input: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 ^ h2) >>> 0
}

/** mulberry32: small, fast 32-bit PRNG with good statistical quality for games. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRng(seed: string): Rng {
  const next = mulberry32(hashString(seed))
  const int = (max: number): number => Math.floor(next() * max)
  return {
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error('Cannot pick from an empty list')
      return items[int(items.length)]
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1)
        ;[items[i], items[j]] = [items[j], items[i]]
      }
      return items
    }
  }
}

/** Short, human-friendly random seed, e.g. "K3F9Q2A". */
export function randomSeed(): string {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0].toString(36).toUpperCase().padStart(7, '0')
}
