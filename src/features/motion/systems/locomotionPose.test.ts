import { describe, expect, it } from 'vitest'

import {
  locomotionSamples,
  mergedSamples,
  travelDirectionOf,
  type ClipMetrics,
  type LocomotionPoseInput,
} from './locomotionPose'

const METRICS: ClipMetrics = {
  idle: { durationSeconds: 8.333, strideLengthMeters: 0 },
  'run-backward': { durationSeconds: 0.633, strideLengthMeters: 1.618 },
  'run-forward': { durationSeconds: 0.733, strideLengthMeters: 2.506 },
  'walk-backward': { durationSeconds: 1.2, strideLengthMeters: 1.21 },
  'walk-forward': { durationSeconds: 1.033, strideLengthMeters: 1.621 },
  'walk-strafe-left': { durationSeconds: 1.467, strideLengthMeters: 0.75 },
  'walk-strafe-right': { durationSeconds: 1.467, strideLengthMeters: 0.75 },
}

const GAIT_SPEEDS = { runSpeed: 3.4, walkSpeed: 1.57 }

function request(overrides: Partial<LocomotionPoseInput> = {}): LocomotionPoseInput {
  return {
    gaitSpeeds: GAIT_SPEEDS,
    metrics: METRICS,
    moveAngleRadians: 0,
    speed: 0,
    travelledMeters: 0,
    ...overrides,
  }
}

describe('travelDirectionOf', () => {
  it('splits the plane into four quadrants around the body', () => {
    expect(travelDirectionOf(0)).toBe('forward')
    expect(travelDirectionOf(Math.PI)).toBe('backward')
    expect(travelDirectionOf(Math.PI / 2)).toBe('right')
    expect(travelDirectionOf(-Math.PI / 2)).toBe('left')
  })
})

describe('locomotionSamples', () => {
  it('asks for idle alone when the body stands still', () => {
    const samples = locomotionSamples(request())

    expect(samples).toHaveLength(1)
    expect(samples[0].clipId).toBe('idle')
    expect(samples[0].onDistance).toBe(false)
  })

  it('weights always sum to one', () => {
    for (const speed of [0, 0.5, 1.57, 2.4, 3.4, 6]) {
      const total = locomotionSamples(request({ speed })).reduce((sum, sample) => sum + sample.weight, 0)
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('drives the walk clip from distance rather than from the clock', () => {
    const stride = METRICS['walk-forward'].strideLengthMeters
    const half = locomotionSamples(request({ speed: 1.57, travelledMeters: stride / 2 }))[0]
    const full = locomotionSamples(request({ speed: 1.57, travelledMeters: stride }))[0]

    expect(half.timeSeconds).toBeCloseTo(METRICS['walk-forward'].durationSeconds / 2, 3)
    expect(full.timeSeconds).toBeCloseTo(0, 3)
  })

  it('plays a clip at its own rate when the body moves at the clip speed', () => {
    const clipSpeed = METRICS['walk-forward'].strideLengthMeters / METRICS['walk-forward'].durationSeconds
    const sample = locomotionSamples(request({ speed: clipSpeed }))
      .find((candidate) => candidate.clipId === 'walk-forward')

    expect(sample?.rate).toBeCloseTo(1, 3)
  })

  it('picks the backward clips when the body backpedals', () => {
    const ids = locomotionSamples(request({ moveAngleRadians: Math.PI, speed: 3.4 })).map((sample) => sample.clipId)

    expect(ids).toContain('run-backward')
  })

  it('carries a sprinting strafe on the walk strafe clip, since no run strafe exists', () => {
    const samples = locomotionSamples(request({ moveAngleRadians: Math.PI / 2, speed: 3.4 }))
    const ids = samples.map((sample) => sample.clipId)

    expect(ids).toEqual(['walk-strafe-right'])
    expect(samples[0].rate).toBeGreaterThan(1)
  })
})

describe('mergedSamples', () => {
  it('folds a clip asked for twice into one weighted entry', () => {
    const samples = mergedSamples(locomotionSamples(request({ moveAngleRadians: Math.PI / 2, speed: 2.4 })))

    expect(samples).toHaveLength(1)
    expect(samples[0].weight).toBeCloseTo(1, 6)
  })
})
