import type { TraceBox, Vector3Tuple } from './boxTrace'
import { normalizeAngle } from './angles'
import { locomotionDirectionOf, movementInActorSpace, type LocomotionDirection } from './locomotionDirection'
import { horizontalSpeed, intentWishDirection, type MotionIntent } from './motionIntent'
import type { MotionProfile } from './motionProfile'
import { advanceMotionVelocity, type MotionVelocityStep } from './motionVelocity'
import { stepSlideMove, type SlideBody } from './slideMove'
import { stepBodyTurn, stepUpperAim, type TurnProfile } from './turnDynamics'

export type MotionMode = 'falling' | 'walking'

export type RotationMode = 'follow-aim' | 'orient-to-movement'

export const MOVING_SPEED_THRESHOLD = 0.05

export type MotionState = {
  readonly aimFacingRadians: number
  readonly bodyFacingRadians: number
  readonly bodyTurnVelocity: number
  readonly groundNormal: Vector3Tuple
  readonly jumpHeld: boolean
  readonly locomotionDirection: LocomotionDirection
  readonly mode: MotionMode
  readonly moving: boolean
  readonly position: Vector3Tuple
  readonly steppedUp: number
  readonly upperAimRadians: number
  readonly velocity: Vector3Tuple
}

export type MotionSettings = {
  readonly halfExtents: Vector3Tuple
  readonly profile: MotionProfile
  readonly rotationMode: RotationMode
  readonly trace: TraceBox
  readonly turnProfile: TurnProfile
}

export type MotionStepInput = {
  readonly aimYaw: number
  readonly delta: number
  readonly intent: MotionIntent
  readonly settings: MotionSettings
  readonly state: MotionState
}

export function createMotionState(position: Vector3Tuple): MotionState {
  return {
    aimFacingRadians: 0,
    bodyFacingRadians: 0,
    bodyTurnVelocity: 0,
    groundNormal: [0, 1, 0],
    jumpHeld: false,
    locomotionDirection: 'idle',
    mode: 'falling',
    moving: false,
    position,
    steppedUp: 0,
    upperAimRadians: 0,
    velocity: [0, 0, 0],
  }
}

function desiredBodyFacing(input: MotionStepInput): number {
  const { aimYaw, intent, settings, state } = input
  if (settings.rotationMode === 'follow-aim') return aimYaw
  const wish = intentWishDirection(intent)
  if (wish.x === 0 && wish.z === 0) return state.bodyFacingRadians
  return Math.atan2(wish.x, wish.z)
}

function bodyFor(state: MotionState, settings: MotionSettings, velocity: MotionVelocityStep): SlideBody {
  return {
    groundNormal: state.groundNormal,
    halfExtents: settings.halfExtents,
    onGround: velocity.onGround,
    position: state.position,
    velocity: velocity.velocity,
  }
}

function locomotionOf(velocity: Vector3Tuple, facingRadians: number): LocomotionDirection {
  if (horizontalSpeed(velocity) <= MOVING_SPEED_THRESHOLD) return 'idle'
  const local = movementInActorSpace({ x: velocity[0], z: velocity[2] }, facingRadians)
  return locomotionDirectionOf(local)
}

export function stepMotionController(input: MotionStepInput): MotionState {
  const { aimYaw, delta, intent, settings, state } = input
  const accelerated = advanceMotionVelocity({
    delta,
    intent,
    profile: settings.profile,
    state: { jumpHeld: state.jumpHeld, onGround: state.mode === 'walking', velocity: state.velocity },
  })

  const moved = stepSlideMove(bodyFor(state, settings, accelerated), {
    delta,
    gravity: settings.profile.gravity,
    profile: settings.profile,
    trace: settings.trace,
  })

  const turned = stepBodyTurn({
    delta,
    desiredFacingRadians: desiredBodyFacing(input),
    profile: settings.turnProfile,
    state: { facingRadians: state.bodyFacingRadians, turnVelocity: state.bodyTurnVelocity },
  })

  const upperAimRadians = stepUpperAim({
    bodyFacingRadians: turned.facingRadians,
    delta,
    desiredFacingRadians: aimYaw,
    profile: settings.turnProfile,
    upperAimRadians: state.upperAimRadians,
  })

  return {
    aimFacingRadians: normalizeAngle(turned.facingRadians + upperAimRadians),
    bodyFacingRadians: turned.facingRadians,
    bodyTurnVelocity: turned.turnVelocity,
    groundNormal: moved.groundNormal,
    jumpHeld: accelerated.jumpHeld,
    locomotionDirection: locomotionOf(moved.velocity, turned.facingRadians),
    mode: moved.onGround ? 'walking' : 'falling',
    moving: horizontalSpeed(moved.velocity) > MOVING_SPEED_THRESHOLD,
    position: moved.position,
    steppedUp: moved.steppedUp,
    upperAimRadians,
    velocity: moved.velocity,
  }
}
