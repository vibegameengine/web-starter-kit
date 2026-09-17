import measuredClips from '../assets/animations/clipMetrics.json'
import groundSpeeds from '../assets/animations/clipGroundSpeeds.json'
import idleUrl from '../assets/animations/idle.glb'
import runningUrl from '../assets/animations/running.glb'
import runningBackwardUrl from '../assets/animations/running-backward.glb'
import walkStrafeRightUrl from '../assets/animations/walk-strafe-right.glb'
import walkingUrl from '../assets/animations/walking.glb'
import walkingBackwardsUrl from '../assets/animations/walking-backwards.glb'
import type { ClipMetric, ClipMetrics, LocomotionClipId } from '../systems/locomotionPose'
import { phaseOffsetOf } from '../systems/phaseAlign'
import type { FootStanceWindows } from '../systems/stanceWindow'

export type MeasuredClip = {
  readonly contactShare: number
  readonly duration: number
  readonly impliedSpeed: number
  readonly name: string
  readonly rootSpeed: number
  readonly stanceWindows: { readonly left: readonly number[]; readonly right: readonly number[] }
  readonly strideLength: number
}

export type LocomotionClipSource = {
  readonly measuredName: string
  readonly mirrored: boolean
  readonly url: string
}

export const LOCOMOTION_CLIP_SOURCES: Readonly<Record<LocomotionClipId, LocomotionClipSource>> = {
  idle: { measuredName: 'idle', mirrored: false, url: idleUrl },
  'run-backward': { measuredName: 'running-backward', mirrored: false, url: runningBackwardUrl },
  'run-forward': { measuredName: 'running', mirrored: false, url: runningUrl },
  'walk-backward': { measuredName: 'walking-backwards', mirrored: false, url: walkingBackwardsUrl },
  'walk-forward': { measuredName: 'walking', mirrored: false, url: walkingUrl },
  'walk-strafe-left': { measuredName: 'walk-strafe-right', mirrored: true, url: walkStrafeRightUrl },
  'walk-strafe-right': { measuredName: 'walk-strafe-right', mirrored: false, url: walkStrafeRightUrl },
}

function measuredClip(name: string): MeasuredClip {
  const found = (measuredClips as readonly MeasuredClip[]).find((candidate) => candidate.name === name)
  if (!found) throw new Error(`clipMetrics.json has no measurement for "${name}" — run npm run animations:measure`)
  return found
}

export type BakedGroundSpeed = {
  readonly clip: string
  readonly groundSpeed: number
  readonly residual: number
  readonly source: string
}

function bakedGroundSpeed(id: LocomotionClipId): number | null {
  const found = (groundSpeeds as readonly BakedGroundSpeed[]).find((candidate) => candidate.clip === id)
  return found ? found.groundSpeed : null
}

function metricOf(id: LocomotionClipId, name: string): ClipMetric {
  const measured = measuredClip(name)
  const baked = bakedGroundSpeed(id)
  const speed = baked ?? measured.impliedSpeed
  return { durationSeconds: measured.duration, strideLengthMeters: speed * measured.duration }
}

export const LOCOMOTION_CLIP_METRICS: ClipMetrics = {
  idle: metricOf('idle', 'idle'),
  'run-backward': metricOf('run-backward', 'running-backward'),
  'run-forward': metricOf('run-forward', 'running'),
  'walk-backward': metricOf('walk-backward', 'walking-backwards'),
  'walk-forward': metricOf('walk-forward', 'walking'),
  'walk-strafe-left': metricOf('walk-strafe-left', 'walk-strafe-right'),
  'walk-strafe-right': metricOf('walk-strafe-right', 'walk-strafe-right'),
}

function clipSpeedOfMetric(id: LocomotionClipId): number {
  const metric = LOCOMOTION_CLIP_METRICS[id]
  return metric.durationSeconds > 0 ? metric.strideLengthMeters / metric.durationSeconds : 0
}

export const WALK_CLIP_SPEED = clipSpeedOfMetric('walk-forward')

export const RUN_CLIP_SPEED = clipSpeedOfMetric('run-forward')

function mirroredWindows(windows: FootStanceWindows): FootStanceWindows {
  return { left: windows.right, right: windows.left }
}

function windowsOf(name: string): FootStanceWindows {
  const measured = measuredClip(name)
  return {
    left: [measured.stanceWindows.left[0], measured.stanceWindows.left[1]],
    right: [measured.stanceWindows.right[0], measured.stanceWindows.right[1]],
  }
}

export const WALK_STANCE_WINDOWS: FootStanceWindows = windowsOf('walking')

export const RUN_STANCE_WINDOWS: FootStanceWindows = windowsOf('running')

export const LOCOMOTION_STANCE_WINDOWS: Readonly<Record<LocomotionClipId, FootStanceWindows>> = {
  idle: windowsOf('idle'),
  'run-backward': windowsOf('running-backward'),
  'run-forward': windowsOf('running'),
  'walk-backward': windowsOf('walking-backwards'),
  'walk-forward': windowsOf('walking'),
  'walk-strafe-left': mirroredWindows(windowsOf('walk-strafe-right')),
  'walk-strafe-right': windowsOf('walk-strafe-right'),
}

export const LOCOMOTION_PHASE_OFFSETS: Readonly<Record<LocomotionClipId, number>> = Object.fromEntries(
  (Object.keys(LOCOMOTION_STANCE_WINDOWS) as readonly LocomotionClipId[]).map((id) => [
    id,
    phaseOffsetOf(LOCOMOTION_STANCE_WINDOWS[id], LOCOMOTION_STANCE_WINDOWS['walk-forward']),
  ]),
) as Readonly<Record<LocomotionClipId, number>>

export const DIRECTION_SPEED_SHARES = {
  backward: clipSpeedOfMetric('walk-backward') / clipSpeedOfMetric('walk-forward'),
  strafe: clipSpeedOfMetric('walk-strafe-right') / clipSpeedOfMetric('walk-forward'),
}

export const LOCOMOTION_GAIT_SPEEDS = {
  runSpeed: RUN_CLIP_SPEED,
  walkSpeed: WALK_CLIP_SPEED,
}
