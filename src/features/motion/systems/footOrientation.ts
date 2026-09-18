import { Quaternion, Vector3 } from 'three'

const UP = new Vector3(0, 1, 0)
const LEVEL_GROUND_DOT = 0.999

export function tiltedFoot(current: Quaternion, groundNormal: Vector3, contact: number): Quaternion {
  const normal = groundNormal.clone().normalize()
  if (contact < 0.01 || normal.dot(UP) > LEVEL_GROUND_DOT) return current.clone()
  const tilted = new Quaternion().setFromUnitVectors(UP, normal).multiply(current)
  return current.clone().slerp(tilted, Math.min(1, contact))
}
