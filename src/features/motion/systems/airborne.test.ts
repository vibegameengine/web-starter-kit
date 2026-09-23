import { describe, expect, it } from 'vitest'

import {
  airLayer,
  GROUNDED_AIR,
  LIGHT_LAND_SPEED,
  MIN_FALL_SECONDS,
  stepAir,
  type AirInput,
  type AirState,
  type AirTimings,
} from './airborne'

const TIMINGS: AirTimings = { absorb: 0.2, jumpSpeed: 4.2, loopDuration: 2.5, riseDuration: 1.333, settle: 0.733, takeoff: 0.1, touchdown: 0 }
const STEP = 1 / 60

function input(overrides: Partial<AirInput> = {}): AirInput {
  return { deltaSeconds: STEP, landing: null, moving: false, now: 0, takeoff: null, ...overrides }
}

function run(state: AirState, frames: number, overrides: Partial<AirInput>): AirState {
  let current = state
  for (let frame = 0; frame < frames; frame += 1) current = stepAir(current, input(overrides), TIMINGS)
  return current
}

describe('stepAir', () => {
  /* @important A jump plays the takeoff clip from its takeoff frame, not from
     frame 0: the body leaves the ground the tick the button is pressed, and the
     clip's first 0.1 s is the crouch before the feet leave, which would put a
     body already in the air back into a crouch. */
  it('starts a jump on the takeoff frame of the takeoff clip', () => {
    const state = stepAir(GROUNDED_AIR, input({ now: 1, takeoff: { atSeconds: 1, jumped: true } }), TIMINGS)
    expect(state.phase).toBe('rise')
    expect(state.time).toBeCloseTo(TIMINGS.takeoff + STEP, 9)
  })

  it('falls into the air loop once the takeoff clip has run out', () => {
    const risen = stepAir(GROUNDED_AIR, input({ now: 1, takeoff: { atSeconds: 1, jumped: true } }), TIMINGS)
    const falling = run(risen, 80, { now: 1, takeoff: { atSeconds: 1, jumped: true } })
    expect(falling.phase).toBe('fall')
  })

  /* @important Walking down a stair is a takeoff too: the collider leaves the
     tread for a few ticks. A body only counts as falling once it has been off
     the ground for as long as a 20 cm drop takes — deeper than a stair riser —
     or every step down would play the air loop and a landing. */
  it('keeps walking down a step as walking', () => {
    const offStep = run(GROUNDED_AIR, Math.floor(MIN_FALL_SECONDS / STEP) - 2, { now: 1, takeoff: { atSeconds: 1, jumped: false } })
    expect(offStep.phase).toBe('ground')
  })

  it('falls once it has been off the ground longer than a stair takes', () => {
    let state = GROUNDED_AIR
    for (let frame = 0; frame < MIN_FALL_SECONDS / STEP + 4; frame += 1) {
      state = stepAir(state, input({ now: 1 + frame * STEP, takeoff: { atSeconds: 1, jumped: false } }), TIMINGS)
    }
    expect(state.phase).toBe('fall')
  })

  it('lands on the landing clip, from its touchdown frame, at a depth set by the landing speed', () => {
    const falling: AirState = { ...GROUNDED_AIR, phase: 'fall', seenTakeoff: 1 }
    const landed = stepAir(falling, input({ landing: { atSeconds: 2, speed: TIMINGS.jumpSpeed }, now: 2 }), TIMINGS)
    expect(landed.phase).toBe('land')
    expect(landed.landWeight).toBeCloseTo(1, 9)
    const soft = stepAir(falling, input({ landing: { atSeconds: 2, speed: (LIGHT_LAND_SPEED + TIMINGS.jumpSpeed) / 2 }, now: 2 }), TIMINGS)
    expect(soft.landWeight).toBeGreaterThan(0.3)
    expect(soft.landWeight).toBeLessThan(0.7)
  })

  it('does not play a landing for a drop too small to need one', () => {
    const falling: AirState = { ...GROUNDED_AIR, phase: 'fall', seenTakeoff: 1 }
    const landed = stepAir(falling, input({ landing: { atSeconds: 2, speed: LIGHT_LAND_SPEED * 0.9 }, now: 2 }), TIMINGS)
    expect(landed.phase).toBe('ground')
  })

  /* @important GASP lets a moving body out of its landing early: running on
     after a jump, the recovery from the crouch is the next stride, not the
     clip's own stand-up. So a moving landing ends a little after the deepest
     point of the crouch; a still one plays through to where the body has
     settled. */
  it('lets a moving landing go soon after the deepest point of the crouch', () => {
    const landing: AirState = { ...GROUNDED_AIR, landWeight: 1, phase: 'land', seenLanding: 2, time: 0 }
    const moving = run(landing, Math.ceil((TIMINGS.absorb + 0.2) / STEP), { moving: true })
    expect(moving.phase).toBe('ground')
    const still = run(landing, Math.ceil((TIMINGS.absorb + 0.2) / STEP), { moving: false })
    expect(still.phase).toBe('land')
    expect(run(still, Math.ceil(TIMINGS.settle / STEP), { moving: false }).phase).toBe('ground')
  })

  it('answers a jump made during a landing', () => {
    const landing: AirState = { ...GROUNDED_AIR, landWeight: 1, phase: 'land', seenLanding: 2, seenTakeoff: 1, time: 0.3 }
    const again = stepAir(landing, input({ now: 3, takeoff: { atSeconds: 3, jumped: true } }), TIMINGS)
    expect(again.phase).toBe('rise')
  })
})

describe('airLayer', () => {
  it('lays nothing over walking', () => {
    expect(airLayer(GROUNDED_AIR, input(), TIMINGS)).toBeNull()
  })

  it('plays the takeoff and the air loop at full weight', () => {
    expect(airLayer({ ...GROUNDED_AIR, phase: 'rise', time: 0.4 }, input(), TIMINGS)).toEqual({ clip: 'jump-start', time: 0.4, weight: 1 })
    expect(airLayer({ ...GROUNDED_AIR, phase: 'fall', time: 1.1 }, input(), TIMINGS)).toEqual({ clip: 'jump-loop', time: 1.1, weight: 1 })
  })

  it('fades a landing out rather than cutting it', () => {
    const landing: AirState = { ...GROUNDED_AIR, landWeight: 1, phase: 'land', time: 0 }
    const early = airLayer(landing, input(), TIMINGS)!
    const late = airLayer({ ...landing, time: TIMINGS.settle - 0.02 }, input(), TIMINGS)!
    expect(early.weight).toBeCloseTo(1, 9)
    expect(late.weight).toBeGreaterThan(0)
    expect(late.weight).toBeLessThan(0.3)
  })
})
