import { describe, expect, it } from 'vitest'

import { interpolationAlpha, lerp, lerpAngle } from './renderInterpolation'

describe('interpolationAlpha', () => {
  it('reports the fraction of the pending step', () => {
    expect(interpolationAlpha(0, 30)).toBe(0)
    expect(interpolationAlpha(1_000 / 60, 30)).toBeCloseTo(0.5, 5)
  })

  it('clamps a leftover larger than one step and rejects a non-positive rate', () => {
    expect(interpolationAlpha(500, 30)).toBe(1)
    expect(interpolationAlpha(-10, 30)).toBe(0)
    expect(interpolationAlpha(10, 0)).toBe(0)
  })
})

describe('lerp', () => {
  it('walks from start to end', () => {
    expect(lerp(2, 6, 0)).toBe(2)
    expect(lerp(2, 6, 0.25)).toBe(3)
    expect(lerp(2, 6, 1)).toBe(6)
  })
})

describe('lerpAngle', () => {
  it('takes the short arc across the wrap point', () => {
    expect(Math.abs(lerpAngle(Math.PI * 0.95, -Math.PI * 0.95, 0.5))).toBeGreaterThan(Math.PI * 0.99)
  })

  it('interpolates linearly away from the wrap point', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 6)
  })
})
