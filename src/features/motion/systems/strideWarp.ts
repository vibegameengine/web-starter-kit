import { Vector3 } from 'three'

import { clampNumber } from './angles'

export type StrideScaleLimits = {
  readonly maximum: number
  readonly minimum: number
}

export const DEFAULT_STRIDE_SCALE_LIMITS: StrideScaleLimits = { maximum: 1.6, minimum: 0.5 }

export function strideScaleFor(bodySpeed: number, clipSpeed: number, limits = DEFAULT_STRIDE_SCALE_LIMITS): number {
  if (clipSpeed <= 1e-4 || bodySpeed <= 1e-4) return 1
  return clampNumber(bodySpeed / clipSpeed, limits.minimum, limits.maximum)
}

const alongStride = new Vector3()

export function warpedFootTarget(
  foot: Readonly<Vector3>,
  hip: Readonly<Vector3>,
  strideDirection: Readonly<Vector3>,
  strideScale: number,
  into: Vector3,
): Vector3 {
  alongStride.subVectors(foot, hip)
  const reach = alongStride.dot(strideDirection)
  return into.copy(foot).addScaledVector(strideDirection, reach * (strideScale - 1))
}

export function pelvisDropFor(
  hips: readonly Readonly<Vector3>[],
  targets: readonly Readonly<Vector3>[],
  legLength: number,
): number {
  let deepest = 0
  for (let index = 0; index < hips.length; index += 1) {
    const distance = hips[index].distanceTo(targets[index])
    if (distance <= legLength) continue
    const overReach = distance - legLength
    if (overReach > deepest) deepest = overReach
  }
  return deepest
}

export function groundedFootTarget(target: Vector3, groundY: number, ankleHeight: number): Vector3 {
  const lowest = groundY + ankleHeight
  if (target.y >= lowest) return target
  target.setY(lowest)
  return target
}
