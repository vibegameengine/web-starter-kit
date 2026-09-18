import { clampNumber } from './angles'
import { damperImplicit } from './rootOffset'

export type FootSupport = {
  readonly groundY: number | null
  readonly hold: number
}

export const SUPPORT_HOLD = 0.5

export const SUPPORT_HALFLIFE = 0.07

export const SUPPORT_MAX_OFFSET = 0.35

export function supportHeight(feet: readonly FootSupport[], colliderFloor: number): number {
  const planted = feet
    .filter((foot) => foot.hold >= SUPPORT_HOLD && foot.groundY !== null)
    .map((foot) => foot.groundY as number)
  return planted.length > 0 ? Math.min(...planted) : colliderFloor
}

/* @important Unreal's implicit damper carries the character between supports,
   and the collider only bounds how far apart the two may get: the collider is
   what collides, the character is what is seen, and the one follows the other
   rather than the other way round. */
export function followSupport(height: number, support: number, colliderFloor: number, deltaSeconds: number): number {
  const followed = height + (support - height) * damperImplicit(SUPPORT_HALFLIFE, deltaSeconds)
  return clampNumber(followed, colliderFloor - SUPPORT_MAX_OFFSET, colliderFloor + SUPPORT_MAX_OFFSET)
}
