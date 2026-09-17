import { approach, clampNumber, normalizeAngle, shortestAngle } from './angles'

export type TurnProfile = {
  readonly bodyTurnAcceleration: number
  readonly bodyTurnDeceleration: number
  readonly bodyTurnSpeed: number
  readonly turnResponse: number
  readonly upperAimLimitRadians: number
  readonly upperAimTurnSpeed: number
}

export const HUMAN_TURN_PROFILE: TurnProfile = {
  bodyTurnAcceleration: 14,
  bodyTurnDeceleration: 40,
  bodyTurnSpeed: 8,
  turnResponse: 10,
  upperAimLimitRadians: Math.PI * 0.42,
  upperAimTurnSpeed: 4.5,
}

export type TurnState = {
  readonly facingRadians: number
  readonly turnVelocity: number
}

export type BodyTurnInput = {
  readonly delta: number
  readonly desiredFacingRadians: number
  readonly profile: TurnProfile
  readonly state: TurnState
}

export type UpperAimInput = {
  readonly bodyFacingRadians: number
  readonly delta: number
  readonly desiredFacingRadians: number
  readonly profile: TurnProfile
  readonly upperAimRadians: number
}

export function stoppableTurnSpeed(remaining: number, profile: TurnProfile): number {
  return Math.sqrt(2 * profile.bodyTurnDeceleration * Math.abs(remaining))
}

export function desiredTurnVelocity(remaining: number, profile: TurnProfile): number {
  const bounded = Math.min(
    profile.bodyTurnSpeed,
    Math.abs(remaining) * profile.turnResponse,
    stoppableTurnSpeed(remaining, profile),
  )
  return Math.sign(remaining) * bounded
}

function turnRateFor(desired: number, current: number, profile: TurnProfile): number {
  const slowing = Math.abs(desired) < Math.abs(current) || Math.sign(desired) !== Math.sign(current)
  return slowing ? profile.bodyTurnDeceleration : profile.bodyTurnAcceleration
}

export function stepBodyTurn({ delta, desiredFacingRadians, profile, state }: BodyTurnInput): TurnState {
  const remaining = shortestAngle(state.facingRadians, desiredFacingRadians)
  const desired = desiredTurnVelocity(remaining, profile)
  const rate = turnRateFor(desired, state.turnVelocity, profile)
  const turnVelocity = approach(state.turnVelocity, desired, rate * delta)
  const travel = clampNumber(turnVelocity * delta, -Math.abs(remaining), Math.abs(remaining))
  return { facingRadians: normalizeAngle(state.facingRadians + travel), turnVelocity }
}

export function stepUpperAim(input: UpperAimInput): number {
  const { bodyFacingRadians, delta, desiredFacingRadians, profile, upperAimRadians } = input
  const desired = clampNumber(
    shortestAngle(bodyFacingRadians, desiredFacingRadians),
    -profile.upperAimLimitRadians,
    profile.upperAimLimitRadians,
  )
  return approach(upperAimRadians, desired, profile.upperAimTurnSpeed * delta)
}
