import { describe, expect, it } from 'vitest'

import type { Vector3Tuple } from './boxTrace'
import { IDLE_MOTION_INTENT, type MotionIntent } from './motionIntent'
import { ARENA_MOTION_PROFILE, GROUNDED_MOTION_PROFILE, profileAtSpeed, SPRINT_SPEED_MULTIPLIER } from './motionProfile'
import { advanceMotionVelocity, type MotionVelocityState } from './motionVelocity'

const STEP = 1 / 60
const PROFILE = GROUNDED_MOTION_PROFILE

function grounded(velocity: Vector3Tuple = [0, 0, 0]): MotionVelocityState {
  return { jumpHeld: false, onGround: true, velocity }
}

function run(intent: MotionIntent, state: MotionVelocityState, steps: number): MotionVelocityState {
  let current = state
  for (let index = 0; index < steps; index += 1) {
    current = advanceMotionVelocity({ delta: STEP, intent, profile: PROFILE, state: current })
  }
  return current
}

describe('every profile can reach its own top speed', () => {
  it('holds for the presets and for a profile built around a clip speed', () => {
    const profiles = [
      GROUNDED_MOTION_PROFILE,
      ARENA_MOTION_PROFILE,
      profileAtSpeed(GROUNDED_MOTION_PROFILE, 1.012),
      profileAtSpeed(GROUNDED_MOTION_PROFILE, 0.6),
    ]

    for (const profile of profiles) {
      let state: MotionVelocityState = { jumpHeld: false, onGround: true, velocity: [0, 0, 0] }
      const intent = { ...IDLE_MOTION_INTENT, forward: 1 }
      for (let index = 0; index < 240; index += 1) {
        state = advanceMotionVelocity({ delta: STEP, intent, profile, state })
      }
      expect(Math.hypot(state.velocity[0], state.velocity[2]) / profile.maxSpeed).toBeGreaterThan(0.95)
    }
  })
})

describe('advanceMotionVelocity', () => {
  it('reaches the profile speed and holds it', () => {
    const state = run({ ...IDLE_MOTION_INTENT, forward: 1 }, grounded(), 120)

    expect(Math.hypot(state.velocity[0], state.velocity[2])).toBeCloseTo(PROFILE.maxSpeed, 3)
  })

  it('gives a diagonal the same speed as a straight run', () => {
    const straight = run({ ...IDLE_MOTION_INTENT, forward: 1 }, grounded(), 120)
    const diagonal = run({ ...IDLE_MOTION_INTENT, forward: 1, right: 1 }, grounded(), 120)

    expect(Math.hypot(diagonal.velocity[0], diagonal.velocity[2]))
      .toBeCloseTo(Math.hypot(straight.velocity[0], straight.velocity[2]), 3)
  })

  it('sprints faster than it walks', () => {
    const walk = run({ ...IDLE_MOTION_INTENT, forward: 1 }, grounded(), 180)
    const sprint = run({ ...IDLE_MOTION_INTENT, forward: 1, sprint: true }, grounded(), 180)

    expect(Math.hypot(sprint.velocity[0], sprint.velocity[2]))
      .toBeCloseTo(Math.hypot(walk.velocity[0], walk.velocity[2]) * SPRINT_SPEED_MULTIPLIER, 2)
  })

  it('brakes to a full stop when the input is released', () => {
    const moving = run({ ...IDLE_MOTION_INTENT, forward: 1 }, grounded(), 120)
    const stopped = run(IDLE_MOTION_INTENT, { ...moving, onGround: true }, 60)

    expect(Math.hypot(stopped.velocity[0], stopped.velocity[2])).toBe(0)
  })

  it('takes a jump on the press and not while the key stays down', () => {
    const jumping = advanceMotionVelocity({
      delta: STEP,
      intent: { ...IDLE_MOTION_INTENT, jump: true },
      profile: PROFILE,
      state: grounded(),
    })
    expect(jumping.jumped).toBe(true)
    expect(jumping.onGround).toBe(false)
    expect(jumping.velocity[1]).toBeCloseTo(PROFILE.jumpVelocity, 5)

    const held = advanceMotionVelocity({
      delta: STEP,
      intent: { ...IDLE_MOTION_INTENT, jump: true },
      profile: PROFILE,
      state: { ...jumping, onGround: true, velocity: [0, 0, 0] },
    })
    expect(held.jumped).toBe(false)
  })

  it('accelerates far more slowly in the air than on the ground', () => {
    const intent = { ...IDLE_MOTION_INTENT, forward: 1 }
    const air = run(intent, { jumpHeld: false, onGround: false, velocity: [0, 0, 0] }, 12)
    const ground = run(intent, grounded(), 12)

    expect(Math.hypot(air.velocity[0], air.velocity[2]))
      .toBeLessThan(Math.hypot(ground.velocity[0], ground.velocity[2]))
  })
})
