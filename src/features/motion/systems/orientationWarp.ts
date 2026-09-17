import { clampNumber, normalizeAngle } from './angles'

export type OrientationWarp = {
  readonly pelvisYawRadians: number
  readonly spineYawRadians: number
}

export const DEFAULT_PELVIS_YAW_LIMIT = Math.PI / 3

export function orientationWarpFor(travelAngleRadians: number, limitRadians = DEFAULT_PELVIS_YAW_LIMIT): OrientationWarp {
  const angle = normalizeAngle(travelAngleRadians)
  const folded = Math.abs(angle) > Math.PI / 2 ? angle - Math.sign(angle) * Math.PI : angle
  const pelvisYawRadians = clampNumber(folded, -limitRadians, limitRadians)
  return { pelvisYawRadians, spineYawRadians: -pelvisYawRadians }
}

export function easedWarp(current: OrientationWarp, wanted: OrientationWarp, share: number): OrientationWarp {
  const eased = current.pelvisYawRadians + (wanted.pelvisYawRadians - current.pelvisYawRadians) * clampNumber(share, 0, 1)
  return { pelvisYawRadians: eased, spineYawRadians: -eased }
}
