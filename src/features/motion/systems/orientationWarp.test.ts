import { describe, expect, it } from 'vitest'

import { DEFAULT_PELVIS_YAW_LIMIT, easedWarp, orientationWarpFor } from './orientationWarp'

describe('orientationWarpFor', () => {
  it('leaves the body alone when it travels where it faces', () => {
    const warp = orientationWarpFor(0)

    expect(warp.pelvisYawRadians).toBeCloseTo(0, 9)
    expect(warp.spineYawRadians).toBeCloseTo(0, 9)
  })

  it('turns the pelvis toward a strafe and counter-rotates the spine', () => {
    const warp = orientationWarpFor(Math.PI / 4)

    expect(warp.pelvisYawRadians).toBeCloseTo(Math.PI / 4, 6)
    expect(warp.spineYawRadians).toBeCloseTo(-Math.PI / 4, 6)
  })

  it('never twists the pelvis past its limit', () => {
    for (const angle of [-Math.PI / 2, -1.2, 1.2, Math.PI / 2]) {
      expect(Math.abs(orientationWarpFor(angle).pelvisYawRadians)).toBeLessThanOrEqual(DEFAULT_PELVIS_YAW_LIMIT + 1e-9)
    }
  })

  it('treats rear travel as a backpedal rather than screwing the hips round', () => {
    const warp = orientationWarpFor(Math.PI * 0.95)

    expect(Math.abs(warp.pelvisYawRadians)).toBeLessThan(Math.PI / 4)
  })

  it('reads a full backpedal as no pelvis turn at all', () => {
    expect(orientationWarpFor(Math.PI).pelvisYawRadians).toBeCloseTo(0, 6)
  })
})

describe('easedWarp', () => {
  it('moves part of the way toward the wanted warp', () => {
    const eased = easedWarp({ pelvisYawRadians: 0, spineYawRadians: 0 }, orientationWarpFor(0.4), 0.5)

    expect(eased.pelvisYawRadians).toBeCloseTo(0.2, 6)
    expect(eased.spineYawRadians).toBeCloseTo(-0.2, 6)
  })

  it('never overshoots when the share is out of range', () => {
    const eased = easedWarp({ pelvisYawRadians: 0, spineYawRadians: 0 }, orientationWarpFor(0.4), 4)

    expect(eased.pelvisYawRadians).toBeCloseTo(0.4, 6)
  })
})
