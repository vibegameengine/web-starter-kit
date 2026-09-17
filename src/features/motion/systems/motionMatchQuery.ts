import { normalizeAngle } from './angles'
import type { TrajectorySample } from './trajectoryPrediction'

export type LocalPose = {
  readonly hips: readonly number[]
  readonly left: readonly number[]
  readonly right: readonly number[]
}

export type TrajectoryFeature = {
  readonly headings: readonly number[]
  readonly positions: readonly number[]
}

export type MotionMatchQueryInput = {
  readonly current: LocalPose
  readonly deltaSeconds: number
  readonly previous: LocalPose
  readonly trajectory: TrajectoryFeature
}

export function localVelocity(
  after: readonly number[],
  before: readonly number[],
  deltaSeconds: number,
): readonly number[] {
  const seconds = Math.max(1e-3, deltaSeconds)
  return [(after[0] - before[0]) / seconds, (after[1] - before[1]) / seconds, (after[2] - before[2]) / seconds]
}

export function intoLocalPlane(
  point: { readonly x: number; readonly z: number },
  origin: { readonly x: number; readonly z: number },
  facingRadians: number,
): readonly [number, number] {
  const dx = point.x - origin.x
  const dz = point.z - origin.z
  const cos = Math.cos(-facingRadians)
  const sin = Math.sin(-facingRadians)
  return [dx * cos + dz * sin, dz * cos - dx * sin]
}

export function trajectoryFeatureOf(
  samples: readonly TrajectorySample[],
  origin: { readonly facingRadians: number; readonly x: number; readonly z: number },
): TrajectoryFeature {
  const headings: number[] = []
  const positions: number[] = []
  for (const sample of samples) {
    const [x, z] = intoLocalPlane(sample.position, origin, origin.facingRadians)
    positions.push(x, z)
    const heading = normalizeAngle(sample.headingRadians - origin.facingRadians)
    headings.push(Math.sin(heading), Math.cos(heading))
  }
  return { headings, positions }
}

export function motionMatchQuery({
  current,
  deltaSeconds,
  previous,
  trajectory,
}: MotionMatchQueryInput): readonly number[] {
  return [
    ...current.left,
    ...current.right,
    ...localVelocity(current.left, previous.left, deltaSeconds),
    ...localVelocity(current.right, previous.right, deltaSeconds),
    ...localVelocity(current.hips, previous.hips, deltaSeconds),
    ...trajectory.positions,
    ...trajectory.headings,
  ].map((value) => (Number.isFinite(value) ? value : 0))
}
