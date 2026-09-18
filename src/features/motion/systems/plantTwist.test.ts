import { describe, expect, it } from 'vitest'

import { footYaw, radiusHold, REPLANT_RADIUS, shouldReplant, twistHold, UNPLANT_ANGLE, UNPLANT_RADIUS, yawBetween } from './plantTwist'

describe('yawBetween', () => {
  it('is the shortest signed turn from one yaw to another', () => {
    expect(yawBetween(0.1, 0.3)).toBeCloseTo(0.2, 9)
    expect(yawBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9)
  })
})

describe('footYaw', () => {
  it('reads the yaw from the ankle toward the toe, whatever the bone axes are', () => {
    expect(footYaw([0, 0, 0], [0, 0, 1])).toBeCloseTo(0, 9)
    expect(footYaw([1, 0, 1], [2, 0, 1])).toBeCloseTo(Math.PI / 2, 9)
  })
})

/* @important Unreal's DeterminePlantType unplants a foot whose animated
   rotation has turned away from the plant by more than UnplantAngle, 45
   degrees, and holds it fully until then; the replant ratio is for planting it
   again, not a fade. Without the angle a foot locked to the ground stays put
   while the body turns about it, and turning on the spot winds that foot
   across the other leg. */
describe('twistHold', () => {
  it('holds fully right up to the unplant angle', () => {
    expect(twistHold(0)).toBe(1)
    expect(twistHold(UNPLANT_ANGLE * 0.95)).toBe(1)
  })

  it('lets go past the unplant angle, either way round', () => {
    expect(twistHold(UNPLANT_ANGLE * 1.05)).toBe(0)
    expect(twistHold(-UNPLANT_ANGLE * 1.5)).toBe(0)
  })
})

/* @important Unreal unplants a foot that has been carried more than
   UnplantRadius, 35 cm, from its plant, and holds it fully until then — a
   standing foot the idle pose would put 17 cm elsewhere stays where it stands.
   notapain holds on to 90 cm, long enough for a body stepping sideways to walk
   off its own locked foot and leave it under the other leg. */
describe('radiusHold', () => {
  it('holds fully right up to the unplant radius', () => {
    expect(radiusHold(0)).toBe(1)
    expect(radiusHold(UNPLANT_RADIUS * 0.95)).toBe(1)
  })

  it('lets go past the unplant radius', () => {
    expect(radiusHold(UNPLANT_RADIUS * 1.05)).toBe(0)
  })
})

/* @important Unreal's Replanted: a foot that let go while it still wants to
   stand plants again, where it now is, once the drawn foot has come back
   within ReplantRadius — 0.35 of the unplant radius — of the animated one.
   Without it a foot that stood through a stop released its stale lock and then
   drifted with the idle pose for as long as the body stood there. */
describe('shouldReplant', () => {
  it('replants once the drawn foot is back within the replant radius of the animated one', () => {
    expect(REPLANT_RADIUS).toBeCloseTo(UNPLANT_RADIUS * 0.35, 9)
    expect(shouldReplant(0.4, 0.2)).toBe(true)
  })

  it('does not replant while the drawn foot is still far from the animated one', () => {
    expect(shouldReplant(0.4, 0.9)).toBe(false)
  })
})
