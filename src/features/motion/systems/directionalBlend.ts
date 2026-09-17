import { normalizeAngle } from './angles'
import type { LocomotionClipId } from './locomotionPose'

export type DirectionalClip = {
  readonly clipId: LocomotionClipId
  readonly headingRadians: number
  readonly speed: number
}

export type BlendedClip = {
  readonly clipId: LocomotionClipId
  readonly weight: number
}

export type DirectionalBlend = {
  readonly clips: readonly BlendedClip[]
  readonly speed: number
}

export const WALK_DIRECTIONS: readonly DirectionalClip[] = [
  { clipId: 'walk-forward', headingRadians: 0, speed: 0 },
  { clipId: 'walk-strafe-right', headingRadians: Math.PI / 2, speed: 0 },
  { clipId: 'walk-backward', headingRadians: Math.PI, speed: 0 },
  { clipId: 'walk-strafe-left', headingRadians: -Math.PI / 2, speed: 0 },
]

export const RUN_DIRECTIONS: readonly DirectionalClip[] = [
  { clipId: 'run-forward', headingRadians: 0, speed: 0 },
  { clipId: 'run-backward', headingRadians: Math.PI, speed: 0 },
]

function angularDistance(from: number, to: number): number {
  return Math.abs(normalizeAngle(to - from))
}

export function directionalBlend(
  travelAngleRadians: number,
  clips: readonly DirectionalClip[],
): DirectionalBlend {
  if (clips.length === 0) throw new Error('a directional blend needs at least one clip')

  const sorted = [...clips].sort(
    (a, b) => angularDistance(travelAngleRadians, a.headingRadians)
      - angularDistance(travelAngleRadians, b.headingRadians),
  )
  const nearest = sorted[0]
  const nearestDistance = angularDistance(travelAngleRadians, nearest.headingRadians)
  if (sorted.length === 1 || nearestDistance < 1e-4) {
    return { clips: [{ clipId: nearest.clipId, weight: 1 }], speed: nearest.speed }
  }

  const second = sorted[1]
  const secondDistance = angularDistance(travelAngleRadians, second.headingRadians)
  const span = nearestDistance + secondDistance
  const nearestWeight = span > 1e-6 ? secondDistance / span : 1

  return {
    clips: [
      { clipId: nearest.clipId, weight: nearestWeight },
      { clipId: second.clipId, weight: 1 - nearestWeight },
    ],
    speed: nearest.speed * nearestWeight + second.speed * (1 - nearestWeight),
  }
}

export function withSpeeds(
  clips: readonly DirectionalClip[],
  speedOf: (clipId: LocomotionClipId) => number,
): readonly DirectionalClip[] {
  return clips.map((clip) => ({ ...clip, speed: speedOf(clip.clipId) }))
}
