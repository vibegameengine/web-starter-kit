import { normalizeAngle } from './angles'
import {
  gaitWeights,
  playbackRateForSpeed,
  stridePhase,
  strideLengthOf,
  type GaitSpeeds,
} from './locomotionBlend'

export type LocomotionClipId =
  | 'idle'
  | 'run-backward'
  | 'run-forward'
  | 'walk-backward'
  | 'walk-forward'
  | 'walk-strafe-left'
  | 'walk-strafe-right'

export type ClipMetric = {
  readonly durationSeconds: number
  readonly strideLengthMeters: number
}

export type ClipMetrics = Readonly<Record<LocomotionClipId, ClipMetric>>

export type LocomotionTravel = 'backward' | 'forward' | 'left' | 'right'

export type LocomotionSample = {
  readonly clipId: LocomotionClipId
  readonly onDistance: boolean
  readonly rate: number
  readonly timeSeconds: number
  readonly weight: number
}

export type LocomotionPoseInput = {
  readonly gaitSpeeds: GaitSpeeds
  readonly metrics: ClipMetrics
  readonly moveAngleRadians: number
  readonly speed: number
  readonly travelledMeters: number
}

const QUARTER_TURN = Math.PI / 4

const THREE_QUARTER_TURN = Math.PI * 0.75

const WALK_CLIPS: Readonly<Record<LocomotionTravel, LocomotionClipId>> = {
  backward: 'walk-backward',
  forward: 'walk-forward',
  left: 'walk-strafe-left',
  right: 'walk-strafe-right',
}

const RUN_CLIPS: Readonly<Record<LocomotionTravel, LocomotionClipId>> = {
  backward: 'run-backward',
  forward: 'run-forward',
  left: 'walk-strafe-left',
  right: 'walk-strafe-right',
}

export function travelDirectionOf(moveAngleRadians: number): LocomotionTravel {
  const angle = normalizeAngle(moveAngleRadians)
  if (Math.abs(angle) <= QUARTER_TURN) return 'forward'
  if (Math.abs(angle) >= THREE_QUARTER_TURN) return 'backward'
  return angle > 0 ? 'right' : 'left'
}

function clipSpeedOf(metric: ClipMetric): number {
  if (metric.durationSeconds <= 0) return 0
  return metric.strideLengthMeters / metric.durationSeconds
}

function movingSample(
  clipId: LocomotionClipId,
  metric: ClipMetric,
  speed: number,
  travelledMeters: number,
): Omit<LocomotionSample, 'weight'> {
  const stride = strideLengthOf(clipSpeedOf(metric), metric.durationSeconds)
  const phase = stridePhase(travelledMeters, stride)
  return {
    clipId,
    onDistance: true,
    rate: playbackRateForSpeed(speed, clipSpeedOf(metric)),
    timeSeconds: phase * metric.durationSeconds,
  }
}

export function locomotionSamples(input: LocomotionPoseInput): readonly LocomotionSample[] {
  const { gaitSpeeds, metrics, moveAngleRadians, speed, travelledMeters } = input
  const weights = gaitWeights(speed, gaitSpeeds)
  const travel = travelDirectionOf(moveAngleRadians)
  const samples: LocomotionSample[] = []

  if (weights.idle > 0) {
    samples.push({ clipId: 'idle', onDistance: false, rate: 1, timeSeconds: 0, weight: weights.idle })
  }
  if (weights.walk > 0) {
    const clipId = WALK_CLIPS[travel]
    samples.push({ ...movingSample(clipId, metrics[clipId], speed, travelledMeters), weight: weights.walk })
  }
  if (weights.run > 0) {
    const clipId = RUN_CLIPS[travel]
    samples.push({ ...movingSample(clipId, metrics[clipId], speed, travelledMeters), weight: weights.run })
  }

  return samples
}

export function mergedSamples(samples: readonly LocomotionSample[]): readonly LocomotionSample[] {
  const byClip = new Map<LocomotionClipId, LocomotionSample>()
  for (const sample of samples) {
    const held = byClip.get(sample.clipId)
    byClip.set(sample.clipId, held ? { ...held, weight: held.weight + sample.weight } : sample)
  }
  return [...byClip.values()]
}
