import { describe, expect, it } from 'vitest'

import {
  gaitWeights,
  MAX_CADENCE,
  MAX_STRIDE,
  MIN_CADENCE,
  MIN_STRIDE,
  splitSpeedRatio,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  orientationWarp,
  playbackRateForSpeed,
  speedNormal,
  strideLengthOf,
  stridePhase,
  strideScaleForSpeed,
} from './locomotionBlend'

const SPEEDS = { runSpeed: 5.2, walkSpeed: 3.2 }

describe('gaitWeights', () => {
  it('stands still below the standing threshold', () => {
    expect(gaitWeights(0, SPEEDS)).toEqual({ idle: 1, run: 0, walk: 0 })
  })

  it('always sums to one', () => {
    for (const speed of [0, 0.4, 1.6, 3.2, 4.1, 5.2, 8]) {
      const weights = gaitWeights(speed, SPEEDS)
      expect(weights.idle + weights.walk + weights.run).toBeCloseTo(1, 6)
    }
  })

  it('is pure walk at the walk speed and pure run at the run speed', () => {
    expect(gaitWeights(SPEEDS.walkSpeed, SPEEDS)).toEqual({ idle: 0, run: 0, walk: 1 })
    expect(gaitWeights(SPEEDS.runSpeed, SPEEDS)).toEqual({ idle: 0, run: 1, walk: 0 })
  })
})

describe('speedNormal', () => {
  it('saturates at the run speed', () => {
    expect(speedNormal(9, SPEEDS)).toBe(1)
    expect(speedNormal(2.6, SPEEDS)).toBeCloseTo(0.5, 6)
  })
})

describe('playbackRateForSpeed', () => {
  it('plays a clip at its own rate when the body travels at the clip speed', () => {
    expect(playbackRateForSpeed(1.6, 1.6)).toBeCloseTo(1, 6)
  })

  it('never stretches a clip past its limits', () => {
    expect(playbackRateForSpeed(0.05, 1.6)).toBe(MIN_PLAYBACK_RATE)
    expect(playbackRateForSpeed(40, 1.6)).toBe(MAX_PLAYBACK_RATE)
  })
})

describe('stridePhase', () => {
  it('advances with distance and wraps at one stride', () => {
    const stride = strideLengthOf(1.6, 1.2)

    expect(stridePhase(0, stride)).toBe(0)
    expect(stridePhase(stride / 2, stride)).toBeCloseTo(0.5, 6)
    expect(stridePhase(stride, stride)).toBeCloseTo(0, 6)
    expect(stridePhase(stride * 2.25, stride)).toBeCloseTo(0.25, 6)
  })

  it('wraps a backward walk into a positive phase', () => {
    expect(stridePhase(-0.25, 1)).toBeCloseTo(0.75, 6)
  })
})

describe('orientationWarp', () => {
  it('leaves a forward stride alone', () => {
    expect(orientationWarp(0, 1)).toEqual({ reversed: false, yawRadians: 0 })
  })

  it('turns the pelvis into a shallow diagonal', () => {
    const warp = orientationWarp(Math.PI / 6, Math.PI / 3)

    expect(warp.reversed).toBe(false)
    expect(warp.yawRadians).toBeCloseTo(Math.PI / 6, 6)
  })

  it('backpedals rather than screwing the hips round', () => {
    const warp = orientationWarp(Math.PI * 0.9, Math.PI / 3)

    expect(warp.reversed).toBe(true)
    expect(Math.abs(warp.yawRadians)).toBeLessThanOrEqual(Math.PI / 3)
  })

  it('never twists the pelvis past the limit', () => {
    for (const angle of [-Math.PI, -1.2, -0.4, 0.4, 1.2, Math.PI]) {
      expect(Math.abs(orientationWarp(angle, Math.PI / 4).yawRadians)).toBeLessThanOrEqual(Math.PI / 4 + 1e-9)
    }
  })
})

describe('splitSpeedRatio', () => {
  it('leaves both alone when the body matches the clip', () => {
    const split = splitSpeedRatio(1.012, 1.012)

    expect(split.cadence).toBeCloseTo(1, 6)
    expect(split.stride).toBeCloseTo(1, 6)
  })

  it('splits a doubled speed between cadence and stride by the square root', () => {
    const split = splitSpeedRatio(2.024, 1.012)

    expect(split.cadence).toBeCloseTo(Math.SQRT2, 6)
    expect(split.stride).toBeCloseTo(Math.SQRT2, 6)
  })

  it('multiplies back to the speed ratio while inside the limits', () => {
    for (const ratio of [0.8, 1, 1.4, 2, 2.5]) {
      const split = splitSpeedRatio(ratio, 1)
      expect(split.cadence * split.stride).toBeCloseTo(ratio, 5)
    }
  })

  it('holds both inside their limits at any speed', () => {
    for (const speed of [0.05, 0.5, 1, 4, 20]) {
      const split = splitSpeedRatio(speed, 1.012)
      expect(split.cadence).toBeGreaterThanOrEqual(MIN_CADENCE)
      expect(split.cadence).toBeLessThanOrEqual(MAX_CADENCE)
      expect(split.stride).toBeGreaterThanOrEqual(MIN_STRIDE)
      expect(split.stride).toBeLessThanOrEqual(MAX_STRIDE)
    }
  })

  it('holds still rather than dividing by a clip that does not travel', () => {
    expect(splitSpeedRatio(2, 0)).toEqual({ cadence: 1, stride: 1 })
  })
})

describe('strideScaleForSpeed', () => {
  it('bounds how far a step may be stretched or squashed', () => {
    expect(strideScaleForSpeed(3.2, 1.6, 1.5)).toBeCloseTo(1.5, 6)
    expect(strideScaleForSpeed(0.2, 1.6, 1.5)).toBeCloseTo(1 / 1.5, 6)
  })
})
