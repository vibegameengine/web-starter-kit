import { clampNumber } from './angles'
import type { MotionProfile } from './motionProfile'

export type StopMatch = {
  readonly phaseScale: number
  readonly targetPhase: number
}

export const MIN_STOP_PHASE_SCALE = 0.7

export const MAX_STOP_PHASE_SCALE = 1.4

export const STOP_MATCH_DISTANCE_METERS = 1.2

/* @important Ground friction here slows a body two ways, so the distance it
   still needs is two terms. Above the stop speed the friction is proportional
   to the speed, which makes dv/ds constant: the speed falls off linearly with
   DISTANCE, not with time. Below it the friction is constant, so the remaining
   distance is the usual v squared over twice the deceleration. */
export function stopDistance(speed: number, profile: MotionProfile): number {
  const friction = profile.groundFriction
  if (friction <= 0 || speed <= 0) return 0
  const { stopSpeed } = profile
  if (speed <= stopSpeed) return (speed * speed) / (2 * friction * stopSpeed)
  return (speed - stopSpeed) / friction + stopSpeed / (2 * friction)
}

function wrapPhase(phase: number): number {
  return phase - Math.floor(phase)
}

/* @important Distance matching, applied to a cycle instead of a shot stop clip:
   the remaining distance is worth a certain advance of the phase, and a plant
   lives at a known phase, so scaling the phase rate by the ratio between the
   two lands the last footfall exactly where the body comes to rest. Unreal
   binary-searches a baked distance curve for the same answer; the loop's own
   stride length is that curve here. */
export function phaseScaleToPlant(
  phase: number,
  remainingDistance: number,
  strideLength: number,
  plantPhases: readonly number[],
): StopMatch {
  const unscaled = { phaseScale: 1, targetPhase: wrapPhase(phase) }
  if (strideLength <= 1e-4 || plantPhases.length === 0) return unscaled
  const wantedAdvance = remainingDistance / strideLength
  if (wantedAdvance <= 1e-4) return unscaled

  let best = unscaled
  let bestError = Number.POSITIVE_INFINITY
  for (const plant of plantPhases) {
    for (let lap = 0; lap <= 1; lap += 1) {
      const advance = wrapPhase(plant - phase) + lap
      if (advance <= 1e-4) continue
      const scale = advance / wantedAdvance
      const error = Math.abs(scale - 1)
      if (error < bestError) {
        bestError = error
        best = {
          phaseScale: clampNumber(scale, MIN_STOP_PHASE_SCALE, MAX_STOP_PHASE_SCALE),
          targetPhase: wrapPhase(plant),
        }
      }
    }
  }
  return best
}
