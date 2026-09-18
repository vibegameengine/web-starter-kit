import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import { tiltedFoot } from './footOrientation'

/* @important notapain's FootRotate, as written: the foot as it stands is
   turned by the rotation that takes up onto the ground's normal, weighted by
   contact, and left alone on level ground. Levelling toward the bind pose
   instead flattened a foot rolling onto its toes at toe-off, which lifted its
   whole sole off the tread: 28.6% of planted frames on a staircase floated
   against 4.8% without it. */
describe('tiltedFoot', () => {
  const rolled = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4)

  it('leaves a foot on level ground exactly as the clip rolled it', () => {
    expect(tiltedFoot(rolled, new Vector3(0, 1, 0), 1).angleTo(rolled)).toBeLessThan(1e-9)
  })

  it('turns the foot by the tilt of a slope at full contact', () => {
    const slope = new Vector3(0, Math.cos(0.2), Math.sin(0.2))
    const tilt = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), slope)
    expect(tiltedFoot(rolled, slope, 1).angleTo(tilt.multiply(rolled))).toBeLessThan(1e-9)
  })

  it('goes part of the way at partial contact, and nowhere at none', () => {
    const slope = new Vector3(0, Math.cos(0.2), Math.sin(0.2))
    expect(tiltedFoot(rolled, slope, 0).angleTo(rolled)).toBeLessThan(1e-9)
    expect(tiltedFoot(rolled, slope, 0.5).angleTo(rolled)).toBeCloseTo(0.1, 6)
  })
})
