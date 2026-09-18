import { Quaternion, Vector3 } from 'three'

const DOWN = new Vector3(0, -1, 0)
const IDENTITY = new Quaternion()

/* @important Which local axis of a foot bone faces the floor is not something a
   rig will tell you, and assuming one works on the character it was written
   against and stands the next one on its toes. The bind pose answers it: a rig
   whose rest pose stands on the ground has its soles flat there, so the axis is
   whatever points down in the rest orientation. */
export function soleDirectionOf(rest: Quaternion): Vector3 {
  return DOWN.clone().applyQuaternion(rest.clone().invert())
}

export function worldSoleNormal(current: Quaternion, rest: Quaternion): Vector3 {
  return soleDirectionOf(rest).applyQuaternion(current).negate()
}

/* @important Nothing else in the pass owns the orientation of the foot: the two
   bone aims that place the leg leave the foot to inherit whatever composition
   of swings they happened to produce, and the tilt that was meant to catch it
   returned early on level ground — `normal.dot(UP) > 0.999` — so a sole was
   never flattened on the one surface the character spends its life on. That is
   the character standing on its toes with its heels in the air.

   The rotation is the MINIMAL one between the sole's normal and the ground's,
   which is what keeps the yaw out of it: flattening a foot must not turn it. */
export function levelledFoot(
  current: Quaternion,
  rest: Quaternion,
  groundNormal: Vector3,
  share: number,
): Quaternion {
  if (share <= 0) return current.clone()
  const sole = worldSoleNormal(current, rest)
  const wanted = groundNormal.clone().normalize()
  if (sole.angleTo(wanted) < 1e-6) return current.clone()
  const full = new Quaternion().setFromUnitVectors(sole, wanted)
  const eased = IDENTITY.clone().slerp(full, Math.min(1, share))
  return eased.multiply(current)
}
