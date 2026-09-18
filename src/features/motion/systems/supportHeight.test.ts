import { describe, expect, it } from 'vitest'

import { followSupport, supportHeight, SUPPORT_MAX_OFFSET } from './supportHeight'

describe('supportHeight', () => {
  /* @important The character stands on its feet, not on its collider. A body on
     a staircase hangs from the lower of its planted feet — the higher one bends
     its knee — until that foot lifts, and only then rises onto the next tread.
     Taking the height from the collider instead put the body up a step as soon
     as the box's front edge was over it, 30 cm before the character got there. */
  it('stands on the lower of two planted feet', () => {
    expect(supportHeight([{ groundY: 0, hold: 1 }, { groundY: 0.15, hold: 1 }], 0.15)).toBeCloseTo(0, 9)
  })

  it('rises onto the higher tread once the lower foot has lifted', () => {
    expect(supportHeight([{ groundY: 0, hold: 0.1 }, { groundY: 0.15, hold: 1 }], 0)).toBeCloseTo(0.15, 9)
  })

  it('falls back to the collider when no foot is planted', () => {
    expect(supportHeight([{ groundY: 0, hold: 0 }, { groundY: 0.3, hold: 0.2 }], 0.42)).toBeCloseTo(0.42, 9)
  })

  it('ignores a foot that has no ground under it', () => {
    expect(supportHeight([{ groundY: null, hold: 1 }, { groundY: 0.15, hold: 1 }], 0)).toBeCloseTo(0.15, 9)
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

  it('never lets the character wander further than its limit from the collider', () => {
    expect(followSupport(0, 2, 2, 1 / 60)).toBeGreaterThanOrEqual(2 - SUPPORT_MAX_OFFSET - 1e-9)
    expect(followSupport(3, 0, 0, 1 / 60)).toBeLessThanOrEqual(SUPPORT_MAX_OFFSET + 1e-9)
  })
})
