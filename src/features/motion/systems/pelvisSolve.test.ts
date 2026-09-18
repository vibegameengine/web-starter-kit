import { describe, expect, it } from 'vitest'

import {
  limbOffsetRange,
  PELVIS_MAX_OFFSET_METERS,
  maxLimbExtension,
  minLimbExtension,
  pelvisOffset,
  PELVIS_MAX_EXTENSION_RATIO,
  PELVIS_MIN_EXTENSION_RATIO,
} from './pelvisSolve'

const LIMB = 0.83

describe('maxLimbExtension', () => {
  it('lets a leg reach a little past the pose it was given', () => {
    const desired = 0.6
    const allowed = maxLimbExtension(desired, LIMB)
    expect(allowed).toBeGreaterThan(desired)
    expect(allowed).toBeCloseTo(desired + (LIMB - desired) * PELVIS_MAX_EXTENSION_RATIO, 6)
  })

  it('never asks a leg to grow', () => {
    expect(maxLimbExtension(0.6, LIMB)).toBeLessThanOrEqual(LIMB)
  })

  it('respects a pose that is already over-extended', () => {
    expect(maxLimbExtension(0.9, LIMB)).toBeCloseTo(0.9)
  })
})

describe('minLimbExtension', () => {
  it('stops the leg folding further than a leg folds', () => {
    expect(minLimbExtension(0.6, LIMB)).toBeCloseTo(LIMB * PELVIS_MIN_EXTENSION_RATIO, 6)
  })

  it('keeps a pose that is already folded tighter', () => {
    expect(minLimbExtension(0.2, LIMB)).toBeCloseTo(0.2)
  })
})

describe('limbOffsetRange', () => {
  const level = { desiredExtension: 0.78, hipHeight: 0.93, horizontalToPlant: 0.05, limbLength: LIMB, plantHeight: 0.12 }

  it('asks for nothing when the plant is where the pose already put the foot', () => {
    const range = limbOffsetRange({ ...level, desiredExtension: level.hipHeight - level.plantHeight })
    expect(range.desired).toBeCloseTo(0, 2)
  })

  it('asks the pelvis down when the ground is below the pose', () => {
    const range = limbOffsetRange({ ...level, plantHeight: -0.1 })
    expect(range.desired).toBeLessThan(0)
  })

  it('allows more travel at full extension than at the pose extension', () => {
    const range = limbOffsetRange({ ...level, plantHeight: -0.1 })
    expect(range.max).toBeLessThan(0)
    expect(range.max).toBeGreaterThan(range.desired)
  })

  it('answers a finite demand for a plant the leg cannot reach at all', () => {
    const range = limbOffsetRange({ ...level, plantHeight: -2 })
    expect(Number.isFinite(range.desired)).toBe(true)
    expect(Number.isFinite(range.max)).toBe(true)
    expect(range.max).toBeLessThan(range.min + 1e-6 + Math.abs(range.min))
  })

  it('leaves room to compress upward', () => {
    const range = limbOffsetRange(level)
    expect(range.min).toBeLessThan(range.desired)
  })
})

describe('pelvisOffset', () => {
  it('stays put when both legs are content', () => {
    const range = { desired: 0, max: 0.1, min: -0.3 }
    expect(pelvisOffset([range, range])).toBeCloseTo(0, 2)
  })

  /* @important The pelvis follows the LOWEST foot, but only as far as the
     highest foot can still stand: taking the deepest drop outright is what bent
     a standing character into a crouch 41 cm deep when one foot hung over a
     ledge it could never reach. */
  it('follows the lower foot without leaving the higher one behind', () => {
    const low = { desired: -0.2, max: -0.15, min: -0.4 }
    const high = { desired: 0, max: 0.05, min: -0.3 }
    const offset = pelvisOffset([low, high])
    expect(offset).toBeLessThan(0)
    expect(offset).toBeGreaterThanOrEqual(-0.2)
  })

  it('never drops further than the tightest leg allows', () => {
    const unreachable = { desired: -1.4, max: -1.2, min: -1.6 }
    const planted = { desired: 0, max: -0.08, min: -0.25 }
    expect(pelvisOffset([unreachable, planted])).toBeGreaterThanOrEqual(-0.25)
  })

  it('answers zero for no legs at all', () => {
    expect(pelvisOffset([])).toBe(0)
  })
})

describe('the pelvis travel limit', () => {
  it('never moves the body further than a pelvis moves, whatever the legs ask', () => {
    const impossible = { desired: -3, max: -2.5, min: -4 }
    expect(pelvisOffset([impossible, impossible])).toBeGreaterThanOrEqual(-PELVIS_MAX_OFFSET_METERS)
  })
})
