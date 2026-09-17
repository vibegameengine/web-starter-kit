import { describe, expect, it } from 'vitest'

import { GROUNDED_MOTION_PROFILE, profileAtSpeed } from './motionProfile'
import {
  MAX_STOP_PHASE_SCALE,
  MIN_STOP_PHASE_SCALE,
  phaseScaleToPlant,
  stopDistance,
} from './stopMatching'

const SHARES = { backward: 0.667, strafe: 0.353 }
const WALK = profileAtSpeed(GROUNDED_MOTION_PROFILE, 1.633, SHARES)

function simulatedStopDistance(speed: number, profile: typeof WALK): number {
  const step = 1 / 600
  let travelled = 0
  let current = speed
  for (let tick = 0; tick < 100000 && current > 1e-4; tick += 1) {
    const control = Math.max(current, profile.stopSpeed)
    current = Math.max(0, current - control * profile.groundFriction * step)
    travelled += current * step
  }
  return travelled
}

describe('stopDistance', () => {
  it('answers what the friction model actually travels', () => {
    const predicted = stopDistance(WALK.maxSpeed, WALK)
    const simulated = simulatedStopDistance(WALK.maxSpeed, WALK)
    expect(predicted).toBeCloseTo(simulated, 1)
  })

  it('answers the same below the stop speed', () => {
    const speed = WALK.stopSpeed * 0.6
    expect(stopDistance(speed, WALK)).toBeCloseTo(simulatedStopDistance(speed, WALK), 2)
  })

  it('needs no distance at rest', () => {
    expect(stopDistance(0, WALK)).toBe(0)
  })

  it('grows with speed', () => {
    expect(stopDistance(2, WALK)).toBeGreaterThan(stopDistance(1, WALK))
  })
})

describe('phaseScaleToPlant', () => {
  const plants = [0.1, 0.6]

  it('lands the phase on a plant over the distance that is left', () => {
    const strideLength = 1
    const match = phaseScaleToPlant(0.2, 0.3, strideLength, plants)
    const landed = 0.2 + 0.3 * match.phaseScale
    expect(landed).toBeCloseTo(match.targetPhase, 5)
  })

  it('takes the plant that needs the least change of rate', () => {
    const match = phaseScaleToPlant(0.5, 0.11, 1, plants)
    expect(match.targetPhase).toBeCloseTo(0.6)
    expect(match.phaseScale).toBeCloseTo(0.909, 2)
  })

  it('crosses the end of the cycle when the near plant is behind', () => {
    const match = phaseScaleToPlant(0.7, 0.4, 1, plants)
    expect(match.targetPhase).toBeCloseTo(0.1)
    expect(match.phaseScale).toBeCloseTo(1, 1)
  })

  it('never stretches the rate past what reads as a walk', () => {
    const fast = phaseScaleToPlant(0.59, 0.5, 1, plants)
    const slow = phaseScaleToPlant(0.1, 0.01, 1, plants)
    expect(fast.phaseScale).toBeGreaterThanOrEqual(MIN_STOP_PHASE_SCALE)
    expect(slow.phaseScale).toBeLessThanOrEqual(MAX_STOP_PHASE_SCALE)
  })

  it('leaves the rate alone with no distance left or no plants known', () => {
    expect(phaseScaleToPlant(0.3, 0, 1, plants).phaseScale).toBe(1)
    expect(phaseScaleToPlant(0.3, 0.5, 1, []).phaseScale).toBe(1)
  })
})
