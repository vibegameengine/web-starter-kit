import { describe, expect, it } from 'vitest'

import {
  gaitWeights,
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

describe('strideScaleForSpeed', () => {
  it('bounds how far a step may be stretched or squashed', () => {
    expect(strideScaleForSpeed(3.2, 1.6, 1.5)).toBeCloseTo(1.5, 6)
    expect(strideScaleForSpeed(0.2, 1.6, 1.5)).toBeCloseTo(1 / 1.5, 6)
  })
})
