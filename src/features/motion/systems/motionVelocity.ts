import type { Vector3Tuple } from './boxTrace'
import { intentDeflection, intentWishDirection, type MotionIntent, type PlaneVector } from './motionIntent'
import {
  BACKWARD_SPEED_MULTIPLIER,
  SPRINT_SPEED_MULTIPLIER,
  STRAFE_SPEED_MULTIPLIER,
  type MotionProfile,
} from './motionProfile'

export type MotionVelocityInput = {
  readonly delta: number
  readonly intent: MotionIntent
  readonly state: MotionVelocityState
  readonly profile: MotionProfile
}

export type MotionVelocityState = {
  readonly jumpHeld: boolean
  readonly onGround: boolean
  readonly velocity: Vector3Tuple
}

export type MotionVelocityStep = MotionVelocityState & {
  readonly jumped: boolean
}

export function directionSpeedMultiplier(intent: MotionIntent): number {
  if (intent.forward < 0) return BACKWARD_SPEED_MULTIPLIER
  if (Math.abs(intent.right) > Math.abs(intent.forward)) return STRAFE_SPEED_MULTIPLIER
  return 1
}

export function wishSpeed(intent: MotionIntent, profile: MotionProfile): number {
  const sprint = intent.sprint && !intent.crouch ? SPRINT_SPEED_MULTIPLIER : 1
  return profile.maxSpeed * sprint * directionSpeedMultiplier(intent) * intentDeflection(intent)
}

export function accelerateTowardWish(
  velocity: Vector3Tuple,
  wish: PlaneVector,
  target: number,
  step: number,
): Vector3Tuple {
  const current = velocity[0] * wish.x + velocity[2] * wish.z
  const missing = target - current
  if (missing <= 0) return velocity
  const added = Math.min(step * target, missing)
  return [velocity[0] + added * wish.x, velocity[1], velocity[2] + added * wish.z]
}

export function applyGroundFriction(velocity: Vector3Tuple, profile: MotionProfile, delta: number): Vector3Tuple {
  const speed = Math.hypot(velocity[0], velocity[2])
  if (speed <= 0) return velocity
  const control = Math.max(speed, profile.stopSpeed)
  const slowed = Math.max(0, speed - control * profile.groundFriction * delta)
  const scale = slowed / speed
  return [velocity[0] * scale, velocity[1], velocity[2] * scale]
}

export function advanceMotionVelocity({ delta, intent, profile, state }: MotionVelocityInput): MotionVelocityStep {
  const wish = intentWishDirection(intent)
  const target = wishSpeed(intent, profile)
  let velocity = state.velocity
  let onGround = state.onGround
  let jumped = false

  if (onGround && intent.jump && !state.jumpHeld) {
    velocity = [velocity[0], profile.jumpVelocity, velocity[2]]
    onGround = false
    jumped = true
  } else if (onGround) {
    velocity = accelerateTowardWish(
      applyGroundFriction(velocity, profile, delta),
      wish,
      target,
      profile.groundAcceleration * delta,
    )
  }

  if (!onGround) {
    velocity = accelerateTowardWish(velocity, wish, target, profile.airAcceleration * delta)
  }

  return { jumpHeld: intent.jump, jumped, onGround, velocity }
}
