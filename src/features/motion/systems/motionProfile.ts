export type MotionProfile = {
  readonly airAcceleration: number
  readonly gravity: number
  readonly groundAcceleration: number
  readonly groundFriction: number
  readonly jumpVelocity: number
  readonly maxSpeed: number
  readonly maxStepHeight: number
  readonly stopSpeed: number
  readonly walkableFloorNormalY: number
}

export const QUAKE_UNIT_METERS = 1 / 32

export const ARENA_MOTION_PROFILE: MotionProfile = {
  airAcceleration: 1,
  gravity: 800 * QUAKE_UNIT_METERS,
  groundAcceleration: 10,
  groundFriction: 6,
  jumpVelocity: 270 * QUAKE_UNIT_METERS,
  maxSpeed: 320 * QUAKE_UNIT_METERS,
  maxStepHeight: 18 * QUAKE_UNIT_METERS,
  stopSpeed: 100 * QUAKE_UNIT_METERS,
  walkableFloorNormalY: 0.7,
}

export const GROUNDED_MOTION_PROFILE: MotionProfile = {
  airAcceleration: 1.4,
  gravity: 9.81,
  groundAcceleration: 9,
  groundFriction: 8,
  jumpVelocity: 4.2,
  maxSpeed: 3.2,
  maxStepHeight: 0.45,
  stopSpeed: 1.2,
  walkableFloorNormalY: 0.7,
}

export const SPRINT_SPEED_MULTIPLIER = 1.625

export const STRAFE_SPEED_MULTIPLIER = 0.85

export const BACKWARD_SPEED_MULTIPLIER = 0.7
