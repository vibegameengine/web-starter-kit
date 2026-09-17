import { describe, expect, it } from 'vitest'

import type { TraceBox, BoxTraceResult, Vector3Tuple } from './boxTrace'
import { groundUnder, stanceGround } from './footGround'

const miss: BoxTraceResult = { fraction: 1, hit: false, normal: [0, 0, 0], startSolid: false }

function floorAbove(insideX: (x: number, z: number) => boolean, surfaceY: number): TraceBox {
  return (from: Vector3Tuple, to: Vector3Tuple) => {
    if (!insideX(from[0], from[2])) return miss
    const span = from[1] - to[1]
    const drop = from[1] - (surfaceY + 0.02)
    if (drop < 0 || drop > span) return miss
    return { fraction: drop / span, hit: true, normal: [0, 1, 0], startSolid: false }
  }
}

describe('groundUnder', () => {
  it('reports the surface below a point', () => {
    const sample = groundUnder([0, 0.1, 0], floorAbove(() => true, 0))
    expect(sample?.surfaceY).toBeCloseTo(0, 3)
  })

  it('reports nothing where there is no ground', () => {
    expect(groundUnder([0, 0.1, 0], () => miss)).toBeNull()
  })
})

describe('stanceGround', () => {
  const ledge = floorAbove((x) => x < 0.2, 0)

  it('keeps a foot over solid ground where it stands', () => {
    const found = stanceGround([0, 0.1, 0], [0, 0], ledge, 0.55)
    expect(found.ground?.surfaceY).toBeCloseTo(0, 3)
    expect(found.pulledX).toBeCloseTo(0)
  })

  it('pulls a foot past the edge back toward the body until ground returns', () => {
    const found = stanceGround([0.6, 0.1, 0], [0, 0], ledge, 0.55)
    expect(found.ground).not.toBeNull()
    expect(found.pulledX).toBeLessThan(0.2)
  })

  it('pulls a foot back off a drop too deep to reach', () => {
    const deep: TraceBox = (from, to, extents) => (
      from[0] > 0.2 ? floorAbove(() => true, -2)(from, to, extents) : floorAbove(() => true, 0)(from, to, extents)
    )
    const found = stanceGround([0.6, 0.1, 0], [0, 0], deep, 0.55)
    expect(found.ground?.surfaceY).toBeCloseTo(0, 3)
    expect(found.pulledX).toBeLessThan(0.2)
  })

  it('gives up on empty air and answers what it found', () => {
    const found = stanceGround([0, 0.1, 0], [0, 0], () => miss, 0.55)
    expect(found.ground).toBeNull()
    expect(found.pulledX).toBeCloseTo(0)
  })
})
