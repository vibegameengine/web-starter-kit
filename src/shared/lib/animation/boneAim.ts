import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

/**
 * Turns a bone so that a direction it currently points along ends up pointing
 * along another one.
 *
 * The rotation is the MINIMAL one between the two directions, composed onto the
 * bone's current world orientation and brought back into its parent's space.
 * That is what lets this work on any rig without being told anything about it:
 * nothing here knows which local axis the bone considers "down its length", and
 * nothing needs to. A solver that assumed one — that a bone points along +Y, say
 * — works perfectly on the character it was written against and bends the next
 * one sideways.
 *
 * Lives here rather than beside its first caller because it has two: the foot
 * planter, which corrects a leg to the floor, and the leg stepper, which places
 * a foot somewhere else entirely. They ask the same question of the same bones.
 */
const from = new Vector3()
const to = new Vector3()
const delta = new Quaternion()
const boneWorld = new Quaternion()
const parentWorld = new Quaternion()

export function aimBoneAlong(bone: Object3D, current: Vector3, desired: Vector3): void {
  if (current.lengthSq() < 1e-12 || desired.lengthSq() < 1e-12) return
  from.copy(current).normalize()
  to.copy(desired).normalize()
  delta.setFromUnitVectors(from, to)
  bone.getWorldQuaternion(boneWorld)
  boneWorld.premultiply(delta)
  if (bone.parent) {
    bone.parent.getWorldQuaternion(parentWorld)
    boneWorld.premultiply(parentWorld.invert())
  }
  bone.quaternion.copy(boneWorld)
}
