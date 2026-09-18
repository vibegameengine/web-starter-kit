import { clampNumber, normalizeAngle } from './angles'

export type OrientationWarp = {
  readonly pelvisYawRadians: number
  readonly spineYawRadians: number
}

export const DEFAULT_PELVIS_YAW_LIMIT = Math.PI / 3

/* @important The pelvis turns most into a sideways step and not at all into a
   straight one, forwards or backwards, and it has to do that continuously: the
   travel angle sweeps the whole circle as a body turns, and the previous fold
   flipped sign at exactly ninety degrees, moving the target 120 degrees between
   two neighbouring angles. The hips jerked 23.6 degrees in one frame through
   every turn, which the clips alone never did — measured at 5.4.

   A sine carries the same intent with no seam anywhere on the circle. Straight
   backwards asks for no twist because that is what the backward clip is for. */
export function orientationWarpFor(travelAngleRadians: number, limitRadians = DEFAULT_PELVIS_YAW_LIMIT): OrientationWarp {
  const angle = normalizeAngle(travelAngleRadians)
  const pelvisYawRadians = clampNumber(limitRadians * Math.sin(angle), -limitRadians, limitRadians)
  return { pelvisYawRadians, spineYawRadians: -pelvisYawRadians }
}

export function easedWarp(current: OrientationWarp, wanted: OrientationWarp, share: number): OrientationWarp {
  const eased = current.pelvisYawRadians + (wanted.pelvisYawRadians - current.pelvisYawRadians) * clampNumber(share, 0, 1)
  return { pelvisYawRadians: eased, spineYawRadians: -eased }
}
