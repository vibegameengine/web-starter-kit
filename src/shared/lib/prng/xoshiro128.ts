/**
 * xoshiro128** — a named, deterministic uint32 pseudo-random generator plus a
 * seed expander. This is the single PRNG the deterministic simulation, dungeon
 * generator and any other shared consumer must use; it is framework-free (no
 * React, three or Photon) and produces byte-identical streams on every machine.
 *
 * Algorithm: xoshiro128** 1.0 by David Blackman and Sebastiano Vigna
 * (https://prng.di.unimi.it/xoshiro128starstar.c, public domain / CC0). The seed
 * expander is splitmix32, the 32-bit analogue of splitmix64 recommended for
 * seeding xoshiro state. All arithmetic is kept in unsigned 32-bit space via
 * `Math.imul` and `>>> 0`, so results never depend on the platform's float ALU.
 */

/** Rotate a uint32 left by `k` bits (0 < k < 32). */
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

/**
 * splitmix32 step function. Given a mutable 32-bit accumulator it returns the
 * next well-mixed uint32. Used to expand a small number of seed words into the
 * four state words xoshiro requires.
 */
export function splitmix32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x9e3779b9) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0
    return (t ^ (t >>> 15)) >>> 0
  }
}

/** The four-word xoshiro128 state. */
export type Xoshiro128State = readonly [number, number, number, number]

/**
 * Expand an ordered list of seed parts into a non-degenerate four-word state.
 * The parts are folded through splitmix32 so that any change to any part (for
 * example seed, generator version, dungeon id code, retry attempt index) yields
 * an independent stream. An all-zero state is impossible for xoshiro, so a
 * fallback bit is set if every mixed word came out zero.
 */
export function expandSeed(...parts: number[]): Xoshiro128State {
  // Fold the parts into a single 32-bit key first so ordering matters and the
  // count of parts is irrelevant to callers.
  let key = 0x243f6a88 >>> 0
  for (const part of parts) {
    const mix = splitmix32((key ^ (part >>> 0)) >>> 0)
    key = mix()
  }
  const next = splitmix32(key)
  const s0 = next()
  const s1 = next()
  const s2 = next()
  const s3 = next()
  if ((s0 | s1 | s2 | s3) === 0) {
    return [1, 0, 0, 0]
  }
  return [s0, s1, s2, s3]
}

/**
 * A seekable xoshiro128** generator. Instances are cheap value objects; clone
 * one to fork an independent-but-reproducible sub-stream.
 */
export class Xoshiro128 {
  private s0: number
  private s1: number
  private s2: number
  private s3: number

  constructor(state: Xoshiro128State) {
    this.s0 = state[0] >>> 0
    this.s1 = state[1] >>> 0
    this.s2 = state[2] >>> 0
    this.s3 = state[3] >>> 0
  }

  /** Current internal state, for snapshotting/verification. */
  getState(): Xoshiro128State {
    return [this.s0, this.s1, this.s2, this.s3]
  }

  /** A generator with the same current state that advances independently. */
  clone(): Xoshiro128 {
    return new Xoshiro128(this.getState())
  }

  /** Next raw uint32 in the range [0, 2^32). */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0
    const t = (this.s1 << 9) >>> 0
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = rotl(this.s3, 11)
    this.s0 >>>= 0
    this.s1 >>>= 0
    this.s2 >>>= 0
    this.s3 >>>= 0
    return result
  }

  /** Uniform float in the half-open unit interval [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 0x100000000
  }

  /**
   * Uniform integer in the inclusive range [minInclusive, maxInclusive] using
   * rejection sampling so the distribution is exactly uniform and identical on
   * every machine. If the range is empty or inverted, `minInclusive` is
   * returned.
   */
  nextInt(minInclusive: number, maxInclusive: number): number {
    const lo = Math.floor(minInclusive)
    const hi = Math.floor(maxInclusive)
    if (hi <= lo) {
      return lo
    }
    const range = hi - lo + 1
    // Largest multiple of `range` that fits in uint32; sample above it is
    // rejected to remove modulo bias.
    const limit = 0x100000000 - (0x100000000 % range)
    let value = this.nextUint32()
    while (value >= limit) {
      value = this.nextUint32()
    }
    return lo + (value % range)
  }
}

/** Convenience: build a seeded generator directly from ordered seed parts. */
export function makeXoshiro128(...parts: number[]): Xoshiro128 {
  return new Xoshiro128(expandSeed(...parts))
}
