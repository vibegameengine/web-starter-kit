import { clampNumber, normalizeAngle } from './angles'

export type GaitWeights = {
  readonly idle: number
  readonly run: number
  readonly walk: number
}

export type GaitSpeeds = {
  readonly runSpeed: number
  readonly walkSpeed: number
}

export const STANDING_SPEED_THRESHOLD = 0.05

export const MIN_PLAYBACK_RATE = 0.5

export const MAX_PLAYBACK_RATE = 1.8

export function gaitWeights(speed: number, { runSpeed, walkSpeed }: GaitSpeeds): GaitWeights {
  if (speed <= STANDING_SPEED_THRESHOLD) return { idle: 1, run: 0, walk: 0 }
  if (speed < walkSpeed) {
    const blend = (speed - STANDING_SPEED_THRESHOLD) / (walkSpeed - STANDING_SPEED_THRESHOLD)
    return { idle: 1 - blend, run: 0, walk: blend }
  }
  if (speed >= runSpeed) return { idle: 0, run: 1, walk: 0 }
  const blend = (speed - walkSpeed) / (runSpeed - walkSpeed)
  return { idle: 0, run: blend, walk: 1 - blend }
}

export function speedNormal(speed: number, { runSpeed }: GaitSpeeds): number {
  return clampNumber(speed / runSpeed, 0, 1)
}

export function playbackRateForSpeed(speed: number, clipTravelSpeed: number): number {
  if (clipTravelSpeed <= 0) return 1
  return clampNumber(speed / clipTravelSpeed, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE)
}

export const MIN_CADENCE = 0.85

export const MAX_CADENCE = 1.6

export const MIN_STRIDE = 0.7

export const MAX_STRIDE = 1.9

export type GaitSplit = {
  readonly cadence: number
  readonly stride: number
}

export function splitSpeedRatio(speed: number, clipTravelSpeed: number): GaitSplit {
  if (clipTravelSpeed <= 1e-4 || speed <= 1e-4) return { cadence: 1, stride: 1 }
  const ratio = speed / clipTravelSpeed
  const cadence = clampNumber(Math.sqrt(ratio), MIN_CADENCE, MAX_CADENCE)
  return { cadence, stride: clampNumber(ratio / cadence, MIN_STRIDE, MAX_STRIDE) }
}

export function strideLengthOf(clipTravelSpeed: number, clipDurationSeconds: number): number {
  return clipTravelSpeed * clipDurationSeconds
}

/* @important The phase is INTEGRATED, never recomputed as a distance divided by
   the stride length: the stride length moves with speed, so recomputing dragged
   the phase backwards every time the warp settled, and the pose jerked up to 33
   degrees in a single frame. As a rate, the stride length only decides how fast
   the cycle runs — which is all it ever meant. */
export function advancePhase(phase: number, travelDelta: number, strideLength: number): number {
  if (strideLength <= 1e-6) return phase
  const advanced = phase + travelDelta / strideLength
  return advanced - Math.floor(advanced)
}

export function stridePhase(travelledMeters: number, strideLengthMeters: number): number {
  if (strideLengthMeters <= 0) return 0
  const phase = (travelledMeters / strideLengthMeters) % 1
  return phase < 0 ? phase + 1 : phase
}

export function clipTimeForPhase(phase: number, clipDurationSeconds: number): number {
  return stridePhase(phase, 1) * clipDurationSeconds
}

export type StrideWarp = {
  readonly reversed: boolean
  readonly yawRadians: number
}

export function orientationWarp(moveAngleRadians: number, limitRadians: number): StrideWarp {
  const angle = normalizeAngle(moveAngleRadians)
  const reversed = Math.abs(angle) > Math.PI / 2
  const folded = reversed ? angle - Math.sign(angle) * Math.PI : angle
  return { reversed, yawRadians: clampNumber(folded, -limitRadians, limitRadians) }
}

export function strideScaleForSpeed(speed: number, clipTravelSpeed: number, maxScale: number): number {
  if (clipTravelSpeed <= 0) return 1
  return clampNumber(speed / clipTravelSpeed, 1 / maxScale, maxScale)
}
