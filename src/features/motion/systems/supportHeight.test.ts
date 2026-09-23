import { describe, expect, it } from 'vitest'

import { followSupport, standingFloor, supportHeight, SUPPORT_MAX_OFFSET, teleported } from './supportHeight'

describe('supportHeight', () => {
  /* @important The character stands on its feet, not on its collider. A body on
     a staircase hangs from the lower of its planted feet — the higher one bends
     its knee — until that foot lifts, and only then rises onto the next tread.
     Taking the height from the collider instead put the body up a step as soon
     as the box's front edge was over it, 30 cm before the character got there. */
  it('stands on the lower of two planted feet', () => {
    expect(supportHeight([{ groundY: 0, hold: 1 }, { groundY: 0.15, hold: 1 }], 0.15, null)).toBeCloseTo(0, 9)
  })

  it('rises onto the higher tread once the lower foot has lifted', () => {
    expect(supportHeight([{ groundY: 0, hold: 0.1 }, { groundY: 0.15, hold: 1 }], 0, null)).toBeCloseTo(0.15, 9)
  })

  it('falls back to the collider when no foot has ever been planted', () => {
    expect(supportHeight([{ groundY: 0, hold: 0 }, { groundY: 0.3, hold: 0.2 }], 0.42, null)).toBeCloseTo(0.42, 9)
  })

  /* @important Between two footfalls neither foot is planted, and the body
     stays on the ground it last stood on until the next foot lands. Falling
     back to the collider instead lifted a body climbing stairs 10 cm a frame,
     since the box collider runs up the flight well ahead of the feet. */
  it('keeps the last support while both feet are between footfalls', () => {
    expect(supportHeight([{ groundY: 0, hold: 0 }, { groundY: 0.3, hold: 0.2 }], 0.6, 0.15)).toBeCloseTo(0.15, 9)
  })

  it('ignores a foot that has no ground under it', () => {
    expect(supportHeight([{ groundY: null, hold: 1 }, { groundY: 0.15, hold: 1 }], 0, null)).toBeCloseTo(0.15, 9)
  })
})

describe('followSupport', () => {
  it('moves toward the support without jumping to it', () => {
    const next = followSupport(0, 0.15, 0.15, 1 / 60)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(0.15)
  })

  it('arrives at the support', () => {
    let height = 0
    for (let frame = 0; frame < 60; frame += 1) height = followSupport(height, 0.15, 0.15, 1 / 60)
    expect(height).toBeCloseTo(0.15, 3)
  })

  /* @important The limit bounds where the character is heading, not where it
     is: clamped outright, a box collider that stepped up a stair ahead of the
     feet dragged the whole body up 10 cm in a single frame. */
  it('is drawn back inside its limit from the collider without jumping', () => {
    const next = followSupport(0, 0, 0.45, 1 / 60)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(0.03)
  })

  it('settles no further than its limit from the collider', () => {
    let height = 0
    for (let frame = 0; frame < 60; frame += 1) height = followSupport(height, 0, 0.45, 1 / 60)
    expect(height).toBeCloseTo(0.45 - SUPPORT_MAX_OFFSET, 3)
    for (let frame = 0; frame < 60; frame += 1) height = followSupport(height, 3, 0, 1 / 60)
    expect(height).toBeCloseTo(SUPPORT_MAX_OFFSET, 3)
  })
})

/* @important In the air there is nothing to stand on, and the character is the
   collider, as Unreal's mesh is its capsule. Kept on the ground it left and
   carried by the damper, a body taking off at 4.2 m/s would trail its collider
   by 0.42 m all the way up. */
describe('standingFloor', () => {
  it('is the collider floor itself while airborne', () => {
    expect(standingFloor({ airborne: true, colliderFloor: 0.8, current: 0, deltaSeconds: 1 / 60, support: 0, wasAirborne: true })).toBe(0.8)
  })

  it('follows the support as before while on the ground', () => {
    const next = standingFloor({ airborne: false, colliderFloor: 0.15, current: 0, deltaSeconds: 1 / 60, support: 0.15, wasAirborne: false })
    expect(next).toBeCloseTo(followSupport(0, 0.15, 0.15, 1 / 60), 9)
  })

  /* @important Touchdown is contact: on the frame the collider lands, the body
     is where the collider is. Carried there by the damper from the height it
     had a tick earlier in the air, it stood 8 cm over the floor at touchdown
     and sank into place over ten frames. */
  it('stands on the collider on the frame it touches down', () => {
    const next = standingFloor({ airborne: false, colliderFloor: 0.001, current: 0.094, deltaSeconds: 1 / 60, support: 0.001, wasAirborne: true })
    expect(next).toBe(0.001)
  })
})

/* @important A warp is any jump of the collider no body could make in one
   frame, sideways as well as up. Checked on height alone, a bench reset from
   the top of a 20 cm ledge back to the start went unnoticed, and the legs kept
   the locks, supports and floors of a place the body had left. */
describe('teleported', () => {
  it('is nothing on the first frame', () => {
    expect(teleported(null, [0, 0, 0])).toBe(false)
  })

  it('is not a stride or a step up', () => {
    expect(teleported([0, 0, 0], [0.05, 0.15, 0.05])).toBe(false)
  })

  it('is a jump across the ground that no frame of walking makes', () => {
    expect(teleported([0, 0.2, 1.5], [0, 0, 0])).toBe(true)
  })
})
