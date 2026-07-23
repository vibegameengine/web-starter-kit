import { describe, expect, it } from 'vitest'

import { Xoshiro128, expandSeed, makeXoshiro128, splitmix32 } from './xoshiro128'

describe('splitmix32', () => {
  it('matches pinned golden output for seed 0', () => {
    const next = splitmix32(0)
    expect([next(), next(), next(), next()]).toEqual([
      1684164658, 3653269916, 2939563536, 2141751570,
    ])
  })

  it('is a pure function of its seed', () => {
    const a = splitmix32(42)
    const b = splitmix32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('Xoshiro128 golden vectors', () => {
  // Canonical raw-state vector: for state [1,2,3,4] the first output is
  // rotl(s1*5, 7) * 9 = rotl(10, 7) * 9 = 1280 * 9 = 11520, matching the
  // reference xoshiro128** C implementation by Blackman & Vigna.
  it('reproduces the reference stream for raw state [1,2,3,4]', () => {
    const rng = new Xoshiro128([1, 2, 3, 4])
    const out = Array.from({ length: 8 }, () => rng.nextUint32())
    expect(out).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849,
    ])
  })

  it('expands seed parts to a pinned state and stream', () => {
    expect(expandSeed(0x1234, 0xabcd)).toEqual([744823941, 480105810, 233145509, 3605505068])
    const rng = makeXoshiro128(0x1234, 0xabcd)
    const out = Array.from({ length: 8 }, () => rng.nextUint32())
    expect(out).toEqual([
      3745494911, 323913176, 109370866, 3325576525, 3334917593, 1033966180, 1668486046,
      4200277254,
    ])
  })
})

describe('Xoshiro128 behaviour', () => {
  it('produces uint32 values in range', () => {
    const rng = makeXoshiro128(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextUint32()
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(0x100000000)
    }
  })

  it('nextFloat stays in [0, 1)', () => {
    const rng = makeXoshiro128(9)
    for (let i = 0; i < 1000; i++) {
      const f = rng.nextFloat()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })

  it('nextInt respects inclusive bounds and returns lo for empty ranges', () => {
    const rng = makeXoshiro128(11)
    for (let i = 0; i < 2000; i++) {
      const v = rng.nextInt(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
    }
    expect(rng.nextInt(5, 5)).toBe(5)
    expect(rng.nextInt(9, 2)).toBe(9)
  })

  it('nextInt covers the whole inclusive range', () => {
    const rng = makeXoshiro128(13)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      seen.add(rng.nextInt(0, 5))
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3, 4, 5]))
  })

  it('clone forks an identical but independent stream', () => {
    const rng = makeXoshiro128(21)
    rng.nextUint32()
    const forked = rng.clone()
    const a = [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]
    const b = [forked.nextUint32(), forked.nextUint32(), forked.nextUint32()]
    expect(a).toEqual(b)
  })

  it('different seed parts yield different streams', () => {
    const a = makeXoshiro128(1, 2, 3).nextUint32()
    const b = makeXoshiro128(1, 2, 4).nextUint32()
    const c = makeXoshiro128(3, 2, 1).nextUint32()
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(b).not.toBe(c)
  })

  it('never emits an all-zero state from expandSeed', () => {
    // A pathological set of parts that could fold toward zero still yields a
    // usable state (xoshiro requires a non-zero state).
    const state = expandSeed(0, 0, 0, 0)
    expect(state.some((word) => word !== 0)).toBe(true)
  })
})
