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

    expect(warp.pelvisYawRadians).toBeGreaterThan(0)
    expect(warp.pelvisYawRadians).toBeLessThan(DEFAULT_PELVIS_YAW_LIMIT)
    expect(warp.spineYawRadians).toBeCloseTo(-warp.pelvisYawRadians, 9)
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
  const wanted = orientationWarpFor(0.4)

  it('moves part of the way toward the wanted warp', () => {
    const eased = easedWarp({ pelvisYawRadians: 0, spineYawRadians: 0 }, wanted, 0.5)

    expect(eased.pelvisYawRadians).toBeCloseTo(wanted.pelvisYawRadians / 2, 9)
    expect(eased.spineYawRadians).toBeCloseTo(-wanted.pelvisYawRadians / 2, 9)
  })

  it('never overshoots when the share is out of range', () => {
    const eased = easedWarp({ pelvisYawRadians: 0, spineYawRadians: 0 }, wanted, 4)

    expect(eased.pelvisYawRadians).toBeCloseTo(wanted.pelvisYawRadians, 9)
  })
})

describe('continuity around the circle', () => {
  /* @important The warp is read every frame from an angle that sweeps as the
     body turns, so a target that jumps anywhere on the circle is a pop in the
     pose. The old fold flipped sign at exactly ninety degrees — the target
     moved 120 degrees between two neighbouring angles — and the hips jerked
     23.6 degrees in a single frame through every turn. */
  it('never jumps between neighbouring travel angles', () => {
    const samples = 720
    let worst = 0
    for (let index = 0; index < samples; index += 1) {
      const angle = (index / samples) * Math.PI * 2 - Math.PI
      const next = ((index + 1) / samples) * Math.PI * 2 - Math.PI
      const step = Math.abs(
        orientationWarpFor(next).pelvisYawRadians - orientationWarpFor(angle).pelvisYawRadians,
      )
      worst = Math.max(worst, step)
    }
    expect(worst).toBeLessThan(0.01)
  })

  it('leaves the pelvis alone when the body travels the way it faces', () => {
    expect(orientationWarpFor(0).pelvisYawRadians).toBeCloseTo(0, 6)
  })

  it('leaves the pelvis alone when the body travels straight backwards', () => {
    expect(orientationWarpFor(Math.PI).pelvisYawRadians).toBeCloseTo(0, 6)
    expect(orientationWarpFor(-Math.PI).pelvisYawRadians).toBeCloseTo(0, 6)
  })

  it('turns the pelvis hardest into a sideways step', () => {
    expect(orientationWarpFor(Math.PI / 2).pelvisYawRadians).toBeCloseTo(DEFAULT_PELVIS_YAW_LIMIT, 6)
    expect(orientationWarpFor(-Math.PI / 2).pelvisYawRadians).toBeCloseTo(-DEFAULT_PELVIS_YAW_LIMIT, 6)
  })

  it('counter-rotates the spine by as much as it turns the pelvis', () => {
    const warp = orientationWarpFor(1)
    expect(warp.spineYawRadians).toBeCloseTo(-warp.pelvisYawRadians, 6)
  })
})
