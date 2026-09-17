import { describe, expect, it } from 'vitest'

import { HUMAN_TURN_PROFILE, stepBodyTurn, stepUpperAim, type TurnState } from './turnDynamics'

const STEP = 1 / 60

function turnToward(target: number, steps: number): { state: TurnState; overshoot: number } {
  let state: TurnState = { facingRadians: 0, turnVelocity: 0 }
  let overshoot = 0
  for (let index = 0; index < steps; index += 1) {
    state = stepBodyTurn({ delta: STEP, desiredFacingRadians: target, profile: HUMAN_TURN_PROFILE, state })
    overshoot = Math.max(overshoot, Math.sign(target) * state.facingRadians - Math.abs(target))
  }
  return { overshoot, state }
}

describe('stepBodyTurn', () => {
  it('settles on the wanted heading', () => {
    const { state } = turnToward(Math.PI / 2, 120)

    expect(state.facingRadians).toBeCloseTo(Math.PI / 2, 4)
    expect(state.turnVelocity).toBeCloseTo(0, 3)
  })

  it('never overshoots a half turn', () => {
    const { overshoot } = turnToward(Math.PI * 0.99, 200)

    expect(overshoot).toBeLessThanOrEqual(0)
  })

  it('spends real time on a half turn', () => {
    const quick = turnToward(Math.PI * 0.99, 20)

    expect(Math.abs(quick.state.facingRadians)).toBeLessThan(Math.PI * 0.8)
  })

  it('holds still when it is already facing the target', () => {
    const state = stepBodyTurn({
      delta: STEP,
      desiredFacingRadians: 0,
      profile: HUMAN_TURN_PROFILE,
      state: { facingRadians: 0, turnVelocity: 0 },
    })

    expect(state.facingRadians).toBe(0)
    expect(state.turnVelocity).toBe(0)
  })
})

describe('stepUpperAim', () => {
  it('travels toward the aim without snapping to it', () => {
    const twist = stepUpperAim({
      bodyFacingRadians: 0,
      delta: STEP,
      desiredFacingRadians: 1,
      profile: HUMAN_TURN_PROFILE,
      upperAimRadians: 0,
    })

    expect(twist).toBeGreaterThan(0)
    expect(twist).toBeLessThan(1)
  })

  it('never twists the spine past its limit', () => {
    let twist = 0
    for (let index = 0; index < 200; index += 1) {
      twist = stepUpperAim({
        bodyFacingRadians: 0,
        delta: STEP,
        desiredFacingRadians: Math.PI * 0.9,
        profile: HUMAN_TURN_PROFILE,
        upperAimRadians: twist,
      })
    }

    expect(twist).toBeCloseTo(HUMAN_TURN_PROFILE.upperAimLimitRadians, 5)
  })
})
