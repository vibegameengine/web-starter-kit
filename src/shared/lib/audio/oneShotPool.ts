/**
 * Variant picking for a pool of interchangeable one-shots (shell racks, impacts,
 * footsteps): which clip plays next, and how far its pitch and level are nudged.
 *
 * One sample replayed at a fixed pitch is the single loudest tell that a weapon
 * is a game asset rather than a machine, and a pool that picks uniformly at
 * random is barely better — an eight-slot pool repeats itself audibly about one
 * shot in eight. So the previous variant is never played twice in a row, and
 * every play is detuned and re-levelled a few percent.
 *
 * Pure and framework-free by design: the caller supplies the random source, so
 * the picker is exhaustively testable and a replay can be made deterministic by
 * handing it a seeded one.
 */

export type OneShotVariation = {
  /** Which clip of the pool to play. */
  readonly index: number
  /** Playback rate multiplier — 1 is the recorded pitch. */
  readonly rate: number
  /** Gain multiplier against the sound's nominal volume. */
  readonly volume: number
}

export type OneShotPoolConfig = {
  readonly variantCount: number
  /** Maximum detune either way, as a fraction of the playback rate. */
  readonly rateSpread: number
  /** Maximum level swing either way, as a fraction of the nominal volume. */
  readonly volumeSpread: number
}

/** A source of numbers in `[0, 1)` — `Math.random` in the game, a stub in specs. */
export type RandomSource = () => number

/**
 * The next variant to play, never the one that just played.
 *
 * Picking uniformly and rejecting a repeat would bias nothing but can loop; this
 * instead picks uniformly among the `variantCount - 1` clips that are NOT the
 * previous one, by rolling an offset and stepping around the ring. Pass a
 * negative `previousIndex` for the first play, when every clip is allowed.
 */
export function pickVariantIndex(variantCount: number, previousIndex: number, roll: number): number {
  const count = Math.max(1, Math.floor(variantCount))
  if (count === 1) return 0
  const bounded = Math.min(0.999999, Math.max(0, roll))
  if (previousIndex < 0 || previousIndex >= count) {
    return Math.floor(bounded * count)
  }
  const offset = Math.floor(bounded * (count - 1))
  return (previousIndex + 1 + offset) % count
}

/** Maps a roll onto `1 ± spread`. A spread of 0 is exactly 1, so it can be disabled. */
export function jitter(spread: number, roll: number): number {
  return 1 + (Math.min(1, Math.max(0, roll)) * 2 - 1) * spread
}

export type OneShotPool = {
  /** The variant to play now, and the pitch/level it plays at. */
  readonly next: () => OneShotVariation
  /** Forgets the last variant, so the next play may repeat it. */
  readonly reset: () => void
}

export function createOneShotPool(config: OneShotPoolConfig, random: RandomSource = Math.random): OneShotPool {
  let previousIndex = -1
  return {
    next() {
      const index = pickVariantIndex(config.variantCount, previousIndex, random())
      previousIndex = index
      return { index, rate: jitter(config.rateSpread, random()), volume: jitter(config.volumeSpread, random()) }
    },
    reset() {
      previousIndex = -1
    },
  }
}
