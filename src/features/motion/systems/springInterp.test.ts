import { describe, expect, it } from 'vitest'

import { DEFAULT_PLANT_SPRING, springStep, type SpringState } from './springInterp'

const STEP = 1 / 60

function settle(from: SpringState, target: number, steps: number, spring = DEFAULT_PLANT_SPRING): SpringState {
  let state = from
  for (let index = 0; index < steps; index += 1) state = springStep(state, target, spring, STEP)
  return state
}

describe('springStep', () => {
  const still: SpringState = { value: 1, velocity: 0 }

  it('arrives at the target', () => {
    expect(settle(still, 0, 120).value).toBeCloseTo(0, 3)
  })

  it('does not overshoot the target', () => {
    let state = still
    let lowest = state.value
    for (let index = 0; index < 120; index += 1) {
      state = springStep(state, 0, DEFAULT_PLANT_SPRING, STEP)
      lowest = Math.min(lowest, state.value)
    }
    expect(lowest).toBeGreaterThan(-0.02)
  })

  /* @important This is the property the whole thing is for. A linear ramp
     reaches its target with whatever speed it was running at and stops dead,
     which is a jerk in the pose; a spring's velocity is continuous through the
     arrival, which is why Unreal springs the plant offset rather than ramping
     it. */
  it('arrives with its velocity already near zero', () => {
    const arrived = settle(still, 0, 120)
    expect(Math.abs(arrived.velocity)).toBeLessThan(0.05)
  })

  it('keeps the velocity it had when the target moves', () => {
    const moving = springStep({ value: 0.5, velocity: -2 }, 0, DEFAULT_PLANT_SPRING, STEP)
    const away = springStep({ value: 0.5, velocity: -2 }, 1, DEFAULT_PLANT_SPRING, STEP)
    expect(moving.velocity).toBeLessThan(0)
    expect(away.velocity).toBeLessThan(0)
    expect(away.velocity).toBeGreaterThan(moving.velocity)
  })

  it('stays stable at a step far longer than it was tuned for', () => {
    const lurched = settle(still, 0, 20, DEFAULT_PLANT_SPRING)
    expect(Number.isFinite(lurched.value)).toBe(true)
    let state = still
    for (let index = 0; index < 20; index += 1) state = springStep(state, 0, DEFAULT_PLANT_SPRING, 0.25)
    expect(Number.isFinite(state.value)).toBe(true)
    expect(Math.abs(state.value)).toBeLessThan(1)
  })

  it('holds still for no time at all', () => {
    const unchanged = springStep(still, 0, DEFAULT_PLANT_SPRING, 0)
    expect(unchanged.value).toBe(still.value)
    expect(unchanged.velocity).toBe(still.velocity)
  })

  it('goes nowhere when it is already there', () => {
    const settled = settle({ value: 0, velocity: 0 }, 0, 10)
    expect(settled.value).toBeCloseTo(0, 9)
    expect(settled.velocity).toBeCloseTo(0, 9)
  })

  /* @important The only target this spring is ever given is zero: a plant holds
     its offset outright while the foot is down, and the spring runs on the
     RELEASE, which is where the ramp used to leave a corner. A spring asked to
     chase a moving target lags it by twice the speed over its frequency, which
     is a property of springs and not a defect — it just is not what this one is
     for. */
  it('carries an offset that was already moving down to nothing', () => {
    const released = settle({ value: 0.25, velocity: -0.8 }, 0, 120)
    expect(released.value).toBeCloseTo(0, 3)
    expect(Math.abs(released.velocity)).toBeLessThan(0.05)
  })
})
