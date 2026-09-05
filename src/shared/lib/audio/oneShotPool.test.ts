import { describe, expect, it } from 'vitest'

import { createOneShotPool, jitter, pickVariantIndex } from './oneShotPool'

/**
 * The pool exists to stop a weapon sounding like a machine, so the properties
 * worth pinning are the two that produce that: a variant never follows itself,
 * and the pitch/level nudge stays inside the spread it was given. Both are
 * checked against a scripted random source rather than `Math.random`, so a
 * failure names the roll that caused it.
 */

/** Returns the given rolls in order, then repeats the last one forever. */
function rolls(...values: number[]) {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

describe('pickVariantIndex', () => {
  it('never returns the variant that just played', () => {
    // Every roll, across every previous index, over a pool big enough for the
    // ring-walk to wrap: the repeat must be unreachable, not merely unlikely.
    for (let previous = 0; previous < 7; previous += 1) {
      for (let step = 0; step < 100; step += 1) {
        expect(pickVariantIndex(7, previous, step / 100)).not.toBe(previous)
      }
    }
  })

  it('can reach every other variant', () => {
    const reached = new Set<number>()
    for (let step = 0; step < 100; step += 1) reached.add(pickVariantIndex(4, 1, step / 100))
    expect([...reached].sort()).toEqual([0, 2, 3])
  })

  it('allows any variant on the first play', () => {
    expect(pickVariantIndex(4, -1, 0)).toBe(0)
    expect(pickVariantIndex(4, -1, 0.99)).toBe(3)
  })

  it('stays in range for a degenerate pool and a roll of exactly 1', () => {
    expect(pickVariantIndex(1, 0, 0.9999)).toBe(0)
    expect(pickVariantIndex(3, 2, 1)).toBeLessThan(3)
    expect(pickVariantIndex(3, 2, 1)).toBeGreaterThanOrEqual(0)
  })
})

describe('jitter', () => {
  it('maps the roll onto 1 +/- spread', () => {
    expect(jitter(0.1, 0)).toBeCloseTo(0.9)
    expect(jitter(0.1, 0.5)).toBeCloseTo(1)
    expect(jitter(0.1, 1)).toBeCloseTo(1.1)
  })

  it('is exactly 1 when the spread is off', () => {
    expect(jitter(0, 0)).toBe(1)
    expect(jitter(0, 1)).toBe(1)
  })
})

describe('createOneShotPool', () => {
  it('varies pitch and level around the chosen variant', () => {
    const pool = createOneShotPool(
      { rateSpread: 0.08, variantCount: 4, volumeSpread: 0.2 },
      rolls(0.5, 1, 0),
    )
    const variation = pool.next()
    expect(variation.index).toBe(2)
    expect(variation.rate).toBeCloseTo(1.08)
    expect(variation.volume).toBeCloseTo(0.8)
  })

  it('does not repeat itself across a long run', () => {
    const pool = createOneShotPool({ rateSpread: 0.05, variantCount: 7, volumeSpread: 0.1 })
    let previous = -1
    for (let play = 0; play < 500; play += 1) {
      const { index } = pool.next()
      expect(index).not.toBe(previous)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(7)
      previous = index
    }
  })

  it('may repeat the last variant again once reset', () => {
    const pool = createOneShotPool({ rateSpread: 0, variantCount: 3, volumeSpread: 0 }, rolls(0))
    expect(pool.next().index).toBe(0)
    pool.reset()
    expect(pool.next().index).toBe(0)
  })
})
