import { describe, expect, it } from 'vitest'

import { FLOOR_LOOKAHEAD_SECONDS, FLOOR_SPRING, followFloor, MAX_GROUND_PENETRATION, pointAhead, type FloorState } from './floorPlane'

const STEP = 1 / 60

/* @important Unreal's UpdatePlantingPlaneInterpolation: each foot pushes out
   of its own planting plane, and that plane's height is sprung toward the
   traced ground (FloorLinearStiffness 1000, damping 1) rather than set to it,
   and held no more than MaxGroundPenetration, 10 cm, under the real ground.
   Pushed out of the traced ground directly, a swing foot whose toe crossed the
   edge of a 20 cm ledge was lifted 10 cm in one frame — a 33 degree snap of the
   shin. */
describe('followFloor', () => {
  it('starts on the ground it first finds', () => {
    expect(followFloor(null, 0.2, STEP).height).toBe(0.2)
  })

  it('rises toward higher ground over several frames, not in one', () => {
    let state: FloorState = followFloor(null, 0, STEP)
    state = followFloor(state, 0.05, STEP)
    expect(state.height).toBeGreaterThan(0)
    expect(state.height).toBeLessThan(0.05)
    for (let frame = 0; frame < 60; frame += 1) state = followFloor(state, 0.05, STEP)
    expect(state.height).toBeCloseTo(0.05, 3)
  })

  it('never lags more than the allowed penetration under the ground', () => {
    const state = followFloor(followFloor(null, 0, STEP), 0.2, STEP)
    expect(state.height).toBeGreaterThanOrEqual(0.2 - MAX_GROUND_PENETRATION - 1e-9)
  })

  it('is held under the ground actually beneath the foot, not the ground it is heading for', () => {
    const state = followFloor(followFloor(null, 0, STEP), 0.3, STEP, 0)
    expect(state.height).toBeLessThan(0.05)
  })

  /* @important Unreal lets the sprung plane sit up to 10 cm inside the ground
     because its planted foot never moves over new ground. Here a foot being
     locked slides onto its lock over a few frames, and on a stair edge that
     sank a standing heel 8 cm into the tread. A foot in stance stands on the
     ground under it; only a foot in the air is eased. */
  it('holds a standing foot on the ground itself', () => {
    const state = followFloor(followFloor(null, 0, STEP), 0.15, STEP, 0.15, 0)
    expect(state.height).toBeCloseTo(0.15, 9)
  })

  it('keeps its height when there is no ground to follow', () => {
    const state = followFloor(followFloor(null, 0.1, STEP), null, STEP)
    expect(state?.height).toBe(0.1)
  })
})

/* @important Unreal still pops a foot onto a step taller than its allowed
   penetration: the plane is pulled to 10 cm under the new ground in one frame,
   and on a 20 cm ledge that is a 6 cm snap. A person lifts the foot before it
   reaches the edge, so a swing foot here reads the ground where its toe will be
   when the floor spring has done its rising — 0.15 s ahead, the time a
   critically damped spring at stiffness 1000 takes to cover 95% of the way. */
describe('pointAhead', () => {
  it('is where the point will be after the look-ahead at its current speed', () => {
    const ahead = pointAhead([1, 2], [0.9, 2], 1 / 60)
    expect(ahead[0]).toBeCloseTo(1 + 0.1 * 60 * FLOOR_LOOKAHEAD_SECONDS, 9)
    expect(ahead[1]).toBeCloseTo(2, 9)
  })

  it('stays put with no previous point or no time', () => {
    expect(pointAhead([1, 2], null, 1 / 60)).toEqual([1, 2])
    expect(pointAhead([1, 2], [0, 0], 0)).toEqual([1, 2])
  })

  it('looks ahead as far as the floor spring needs to rise', () => {
    expect(FLOOR_LOOKAHEAD_SECONDS).toBeCloseTo(4.7 / Math.sqrt(FLOOR_SPRING.stiffness), 9)
  })
})
