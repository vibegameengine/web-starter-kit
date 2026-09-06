import { describe, expect, it } from 'vitest'

import { overlayCoverage, resolveLayerWeights, type LayerSample, type TerrainLayer } from './terrainLayerStack'

const base: TerrainLayer = { id: 'dirt', tileMeters: 4, blend: 'weight' }
const turf: TerrainLayer = { id: 'turf', tileMeters: 3, blend: 'height' }
const gravel: TerrainLayer = { id: 'gravel', tileMeters: 2, blend: 'height' }
const road: TerrainLayer = { id: 'road', tileMeters: 6, blend: 'alpha' }
const stone: TerrainLayer = { id: 'stone', tileMeters: 1, blend: 'overlay' }

const at = (weight: number, height = 0.5): LayerSample => ({ weight, height })
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

describe('terrain layer stack', () => {
  it('always sums to one, so the surface is never left unshaded', () => {
    // The all-height-blend hole: a point where every layer's weight races to
    // zero and the shader has nothing to shade with.
    for (let a = 0; a <= 1.001; a += 0.25) {
      for (let b = 0; b <= 1.001; b += 0.25) {
        const weights = resolveLayerWeights([base, turf, gravel], [at(1), at(a), at(b)])
        expect(sum(weights)).toBeCloseTo(1, 6)
        expect(Math.min(...weights)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('leaves the base showing where every other layer is masked out', () => {
    const weights = resolveLayerWeights([base, turf, gravel], [at(1), at(0), at(0)])
    expect(weights[0]).toBeCloseTo(1, 6)
  })

  it('lets the taller layer take the edge where two masks meet equally', () => {
    // A weight blend gives 50/50 mush; the height blend has to pick a winner,
    // which is what makes an edge read as interlocking rather than cross-faded.
    const weights = resolveLayerWeights([base, turf, gravel], [at(1), at(0.5, 0.35), at(0.5, 0.8)])
    expect(weights[2]).toBeGreaterThan(weights[1] * 5)
  })

  it('honours a height bias as the tie-breaker between equal reliefs', () => {
    const plain = resolveLayerWeights([base, turf, gravel], [at(1), at(0.5), at(0.5)])
    const tilted = resolveLayerWeights([base, turf, { ...gravel, heightBias: 0.2 }], [at(1), at(0.5), at(0.5)])
    expect(tilted[2]).toBeGreaterThan(plain[2])
  })

  it('covers completely under an alpha layer — a road is not 70% road', () => {
    const weights = resolveLayerWeights([base, turf, road], [at(1), at(1), at(1)])
    expect(weights[2]).toBeCloseTo(1, 6)
    expect(weights[0]).toBeCloseTo(0, 6)
  })

  it('keeps what is under an alpha edge in proportion', () => {
    const open = resolveLayerWeights([base, turf, road], [at(1), at(1), at(0)])
    const half = resolveLayerWeights([base, turf, road], [at(1), at(1), at(0.5)])
    expect(sum(half)).toBeCloseTo(1, 6)
    expect(half[2]).toBeCloseTo(0.5, 6)
    // The verge keeps the dirt-to-turf ratio it had in the open, at half the
    // room: a lid must not restyle the ground beside it.
    expect(half[0] / half[1]).toBeCloseTo(open[0] / open[1], 5)
  })

  it('handles an empty stack without throwing', () => {
    expect(resolveLayerWeights([], [])).toEqual([])
  })

  it('lays an overlay over the lid, not under it: stones are ON the road', () => {
    // The whole reason overlay exists. An alpha lid covers everything that
    // competed for weight; a stone lying on the road competed for nothing.
    const weights = resolveLayerWeights(
      [base, road, stone],
      [at(1), at(1), at(1, 1)],
    )
    expect(weights[2]).toBeCloseTo(1, 6)
    expect(weights[1]).toBeCloseTo(0, 6)
    expect(sum(weights)).toBeCloseTo(1, 6)
  })

  it('lets the stack through the gaps between the stones', () => {
    // Relief below the cut is soil, not stone, and soil shows whatever the
    // stack resolved underneath — including the road.
    const weights = resolveLayerWeights([base, road, stone], [at(1), at(1), at(1, 0)])
    expect(weights[2]).toBeCloseTo(0, 6)
    expect(weights[1]).toBeCloseTo(1, 6)
  })

  it('keeps an overlay inside its mask however high its relief', () => {
    // Everywhere is not unconditional: a mask of zero means no stone here, even
    // on a peak of the height map.
    expect(overlayCoverage(stone, at(0, 1))).toBe(0)
    expect(overlayCoverage(stone, at(0.5, 1))).toBeCloseTo(0.5, 6)
  })

  it('covers the fraction of ground the density asks for', () => {
    // The coverage channel is RANKED, so a point's value is the share of the map
    // below it. Cutting at 1 - density therefore claims exactly that share —
    // which is the whole reason density can be a number an author states.
    const samples = Array.from({ length: 1000 }, (_, i) => at(1, i / 999))
    for (const density of [0.1, 0.3, 0.5]) {
      const covered = samples.filter((s) => overlayCoverage({ ...stone, density }, s) > 0.5).length
      expect(covered / samples.length).toBeCloseTo(density, 1)
    }
  })

  it('reads as soil below the cut and as stone above it', () => {
    expect(overlayCoverage({ ...stone, density: 0.3 }, at(1, 0.5))).toBe(0)
    expect(overlayCoverage({ ...stone, density: 0.3 }, at(1, 0.95))).toBeCloseTo(1, 6)
  })
})
