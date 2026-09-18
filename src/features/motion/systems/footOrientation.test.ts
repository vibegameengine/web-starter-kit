import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import { levelledFoot, soleDirectionOf, worldSoleNormal } from './footOrientation'

const UP = new Vector3(0, 1, 0)
const PITCH = (radians: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), radians)

/* @important The mannequin's foot bone sits pitched 65 degrees in its own rest
   pose, so a flat sole is not the identity and cannot be written as one. The
   rest orientation IS flat, by definition of a bind pose that stands on the
   floor, and every angle here is measured against it. */
const REST = PITCH((65.4 * Math.PI) / 180)

describe('soleDirectionOf', () => {
  it('finds the axis that points at the floor in the foot own frame', () => {
    const sole = soleDirectionOf(REST)
    expect(sole.applyQuaternion(REST).angleTo(UP.clone().negate())).toBeLessThan(1e-6)
  })
})

describe('worldSoleNormal', () => {
  it('reads the rest foot as standing level', () => {
    expect(worldSoleNormal(REST, REST).angleTo(UP)).toBeLessThan(1e-6)
  })

  it('follows the foot as it rolls onto its toes', () => {
    const onPointe = PITCH(0.8).multiply(REST)
    expect(worldSoleNormal(onPointe, REST).angleTo(UP)).toBeCloseTo(0.8, 5)
  })
})

describe('levelledFoot', () => {
  const onPointe = PITCH(0.7).multiply(REST)

  it('leaves a foot that already stands flat alone', () => {
    const levelled = levelledFoot(REST, REST, UP, 1)
    expect(levelled.angleTo(REST)).toBeLessThan(1e-6)
  })

  it('puts the sole flat on the floor at full weight', () => {
    const levelled = levelledFoot(onPointe, REST, UP, 1)
    expect(worldSoleNormal(levelled, REST).angleTo(UP)).toBeLessThan(1e-6)
  })

  it('does nothing at no weight', () => {
    expect(levelledFoot(onPointe, REST, UP, 0).angleTo(onPointe)).toBeLessThan(1e-6)
  })

  it('goes half the way at half weight', () => {
    const half = levelledFoot(onPointe, REST, UP, 0.5)
    expect(worldSoleNormal(half, REST).angleTo(UP)).toBeCloseTo(0.35, 2)
  })

  it('lands the sole on a slope rather than on the level', () => {
    const slope = new Vector3(0, Math.cos(0.3), Math.sin(0.3)).normalize()
    const levelled = levelledFoot(onPointe, REST, slope, 1)
    expect(worldSoleNormal(levelled, REST).angleTo(slope)).toBeLessThan(1e-6)
  })

  /* @important Levelling must not turn the foot about the vertical: which way
     the toes point belongs to the clip and to the body, and a solver that
     quietly yaws the foot while flattening it is how a stance ends up
     pigeon-toed. */
  it('leaves the direction the toes point alone', () => {
    const toeAxis = new Vector3(0, 0, 1).applyQuaternion(REST.clone().invert())
    const toeOf = (quaternion: Quaternion) => {
      const toe = toeAxis.clone().applyQuaternion(quaternion)
      return Math.atan2(toe.x, toe.z)
    }
    const turned = new Quaternion().setFromAxisAngle(UP, 0.4).multiply(onPointe)
    expect(toeOf(levelledFoot(turned, REST, UP, 1))).toBeCloseTo(toeOf(turned), 4)
  })
})
