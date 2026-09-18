import { clampNumber } from './angles'

export const ROOT_HEIGHT_HALFLIFE = 0.08

export const ROOT_HEIGHT_MAX_ERROR = 0.3

/* @important Unreal's implicit damper from OffsetRootBone, kept as it is: the
   share of the remaining distance to close this frame, so that half of it is
   gone after one half-life however the time is sliced. The half-life is held at
   no less than the frame, which Unreal calls a hack in its own source and keeps
   because a half-life shorter than the frame spikes. */
export function damperImplicit(halflife: number, deltaSeconds: number): number {
  const held = Math.max(halflife, deltaSeconds)
  return clampNumber(1 - Math.exp((-Math.LN2 * deltaSeconds) / (held + 1e-8)), 0, 1)
}

export function followedRootHeight(rootHeight: number, capsuleHeight: number, deltaSeconds: number): number {
  const followed = rootHeight + (capsuleHeight - rootHeight) * damperImplicit(ROOT_HEIGHT_HALFLIFE, deltaSeconds)
  return clampNumber(followed, capsuleHeight - ROOT_HEIGHT_MAX_ERROR, capsuleHeight + ROOT_HEIGHT_MAX_ERROR)
}
