import { describe, expect, it } from 'vitest'

import {
  DEFAULT_INERTIAL_SECONDS,
  inertialCurve,
  inertialShare,
  inertialValue,
} from './inertialBlend'

/* @important One-sided on purpose: the value is clamped to zero outside the
   blend, so a central difference at either end averages the curve with the
   clamp and reports half the slope. */
const derivative = (curve: ReturnType<typeof inertialCurve>, at: number) => {
  const step = 1e-5
  if (at <= step) return (inertialValue(curve, step) - inertialValue(curve, 0)) / step
  if (at >= curve.duration - step) {
    return (inertialValue(curve, curve.duration) - inertialValue(curve, curve.duration - step)) / step
  }
  return (inertialValue(curve, at + step) - inertialValue(curve, at - step)) / (2 * step)
}

describe('inertialCurve', () => {
  it('starts at the offset the switch left behind', () => {
    const curve = inertialCurve(0.4, 0, DEFAULT_INERTIAL_SECONDS)
    expect(inertialValue(curve, 0)).toBeCloseTo(0.4, 6)
  })

  it('starts with the velocity the pose already had', () => {
    const curve = inertialCurve(0.4, -0.5, DEFAULT_INERTIAL_SECONDS)
    expect(derivative(curve, 0)).toBeCloseTo(-0.5, 2)
  })

  it('reaches zero at the end of the blend, and stays there', () => {
    const curve = inertialCurve(0.4, 0, DEFAULT_INERTIAL_SECONDS)
    expect(inertialValue(curve, curve.duration)).toBeCloseTo(0, 6)
    expect(inertialValue(curve, curve.duration + 1)).toBe(0)
  })

  it('arrives without a jerk — zero velocity at the end', () => {
    const curve = inertialCurve(0.4, -0.2, DEFAULT_INERTIAL_SECONDS)
    expect(derivative(curve, curve.duration)).toBeCloseTo(0, 2)
  })

  it('never overshoots into the other side', () => {
    const curve = inertialCurve(0.4, -3, DEFAULT_INERTIAL_SECONDS)
    for (let t = 0; t <= curve.duration; t += curve.duration / 40) {
      expect(inertialValue(curve, t)).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('shortens the blend when the offset is already closing fast', () => {
    const fast = inertialCurve(0.1, -5, DEFAULT_INERTIAL_SECONDS)
    expect(fast.duration).toBeLessThan(DEFAULT_INERTIAL_SECONDS)
  })

  it('drops a velocity that is pulling the offset wider', () => {
    const widening = inertialCurve(0.4, 2, DEFAULT_INERTIAL_SECONDS)
    expect(derivative(widening, 0)).toBeCloseTo(0, 2)
  })

  it('answers nothing for no offset and for no time', () => {
    expect(inertialValue(inertialCurve(0, -1, 0.3), 0)).toBe(0)
    expect(inertialValue(inertialCurve(0.4, 0, 0), 0)).toBe(0)
  })
})

describe('inertialShare', () => {
  it('runs from the whole offset down to none of it', () => {
    const curve = inertialCurve(0.4, 0, DEFAULT_INERTIAL_SECONDS)
    expect(inertialShare(curve, 0)).toBeCloseTo(1, 6)
    expect(inertialShare(curve, curve.duration / 2)).toBeGreaterThan(0)
    expect(inertialShare(curve, curve.duration / 2)).toBeLessThan(1)
    expect(inertialShare(curve, curve.duration)).toBeCloseTo(0, 6)
  })

  it('is the same shape whatever the size of the offset', () => {
    const small = inertialCurve(0.05, 0, DEFAULT_INERTIAL_SECONDS)
    const large = inertialCurve(0.8, 0, DEFAULT_INERTIAL_SECONDS)
    expect(inertialShare(small, 0.1)).toBeCloseTo(inertialShare(large, 0.1), 6)
  })
})
