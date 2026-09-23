import { clampNumber } from './angles'
import { damperImplicit } from './rootOffset'

export type FootSupport = {
  readonly groundY: number | null
  readonly hold: number
}

export const SUPPORT_HOLD = 0.5

export const SUPPORT_HALFLIFE = 0.07

export const SUPPORT_MAX_OFFSET = 0.35

export function supportHeight(feet: readonly FootSupport[], colliderFloor: number, previous: number | null): number {
  const planted = feet
    .filter((foot) => foot.hold >= SUPPORT_HOLD && foot.groundY !== null)
    .map((foot) => foot.groundY as number)
  return planted.length > 0 ? Math.min(...planted) : previous ?? colliderFloor
}

/* @important Unreal's implicit damper carries the character between supports,
   and the collider only bounds how far apart the two may get: the collider is
   what collides, the character is what is seen, and the one follows the other
   rather than the other way round. The bound is on where the character is
   heading, so the collider running ahead never drags it in a single frame. */
export function followSupport(height: number, support: number, colliderFloor: number, deltaSeconds: number): number {
  const target = clampNumber(support, colliderFloor - SUPPORT_MAX_OFFSET, colliderFloor + SUPPORT_MAX_OFFSET)
  return height + (target - height) * damperImplicit(SUPPORT_HALFLIFE, deltaSeconds)
}

export function teleported(previous: readonly [number, number, number] | null, current: readonly [number, number, number]): boolean {
  if (!previous) return false
  return Math.hypot(current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]) > SUPPORT_MAX_OFFSET
}

export type StandingFloorInput = {
  readonly airborne: boolean
  readonly colliderFloor: number
  readonly current: number
  readonly deltaSeconds: number
  readonly support: number
  readonly wasAirborne: boolean
}

export function standingFloor(input: StandingFloorInput): number {
  if (input.airborne || input.wasAirborne) return input.colliderFloor
  return followSupport(input.current, input.support, input.colliderFloor, input.deltaSeconds)
}
