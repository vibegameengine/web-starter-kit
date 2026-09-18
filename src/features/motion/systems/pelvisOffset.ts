import { Quaternion, Vector3 } from 'three'

const DOWN = new Vector3(0, -1, 0)

/* @important A pelvis drop is a world-vertical offset written to a bone whose
   parent turns with the body, so only the OFFSET is converted, as a direction.
   Converting the bone's whole world position instead — lower it, then bring the
   point back through the parent — rewrites the bone's X and Z as well, out of a
   parent matrix belonging to the frame before, and the pelvis was dragged 38 cm
   sideways through a turn. */
export function localDropOffset(parentRotation: Quaternion, parentScale: Vector3, drop: number): Vector3 {
  if (drop <= 0) return new Vector3()
  const offset = DOWN.clone().multiplyScalar(drop).applyQuaternion(parentRotation.clone().invert())
  return offset.divide(new Vector3(
    parentScale.x === 0 ? 1 : parentScale.x,
    parentScale.y === 0 ? 1 : parentScale.y,
    parentScale.z === 0 ? 1 : parentScale.z,
  ))
}
