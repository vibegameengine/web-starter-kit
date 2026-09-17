import { normalizeAngle, shortestAngle } from './angles'
import type { PlaneVector } from './motionIntent'

export type TrajectorySample = {
  readonly headingRadians: number
  readonly position: PlaneVector
}

export type TrajectoryPredictionInput = {
  readonly accelerationTime: number
  readonly currentVelocity: PlaneVector
  readonly desiredVelocity: PlaneVector
  readonly facingRadians: number
  readonly offsets: readonly number[]
  readonly turnTime: number
}

export const DEFAULT_ACCELERATION_TIME = 0.18

export const DEFAULT_TURN_TIME = 0.22

function approachedTravel(current: number, desired: number, seconds: number, timeConstant: number): number {
  if (timeConstant <= 1e-4) return desired * seconds
  const decay = Math.exp(-seconds / timeConstant)
  return desired * seconds + (current - desired) * timeConstant * (1 - decay)
}

function desiredHeading(desiredVelocity: PlaneVector, facingRadians: number): number {
  if (Math.hypot(desiredVelocity.x, desiredVelocity.z) < 1e-4) return facingRadians
  return Math.atan2(desiredVelocity.x, desiredVelocity.z)
}

export function predictTrajectory(input: TrajectoryPredictionInput): readonly TrajectorySample[] {
  const { accelerationTime, currentVelocity, desiredVelocity, facingRadians, offsets, turnTime } = input
  const heading = desiredHeading(desiredVelocity, facingRadians)
  const turn = shortestAngle(facingRadians, heading)

  return offsets.map((seconds) => {
    const ahead = Math.max(0, seconds)
    const decay = turnTime <= 1e-4 ? 0 : Math.exp(-ahead / turnTime)
    return {
      headingRadians: normalizeAngle(facingRadians + turn * (1 - decay)),
      position: {
        x: approachedTravel(currentVelocity.x, desiredVelocity.x, ahead, accelerationTime),
        z: approachedTravel(currentVelocity.z, desiredVelocity.z, ahead, accelerationTime),
      },
    }
  })
}

export function intoLocalTrajectory(
  sample: TrajectorySample,
  origin: TrajectorySample,
): TrajectorySample {
  const dx = sample.position.x - origin.position.x
  const dz = sample.position.z - origin.position.z
  const cos = Math.cos(-origin.headingRadians)
  const sin = Math.sin(-origin.headingRadians)
  return {
    headingRadians: shortestAngle(origin.headingRadians, sample.headingRadians),
    position: { x: dx * cos + dz * sin, z: dz * cos - dx * sin },
  }
}
