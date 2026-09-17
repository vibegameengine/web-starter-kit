import { type PlaneVector, yawForward, yawRight } from './motionIntent'

export type LocomotionDirection =
  | 'backward'
  | 'backward-left'
  | 'backward-right'
  | 'forward'
  | 'forward-left'
  | 'forward-right'
  | 'idle'
  | 'left'
  | 'right'

const DIAGONAL_THRESHOLD = Math.cos((67.5 * Math.PI) / 180)

export function movementInActorSpace(movement: PlaneVector, facingRadians: number): PlaneVector {
  const forward = yawForward(facingRadians)
  const right = yawRight(facingRadians)
  return {
    x: movement.x * right.x + movement.z * right.z,
    z: movement.x * forward.x + movement.z * forward.z,
  }
}

/* @important The kit's right axis is forward x up, so for a body facing +Z it
   points at -X: atan2(velocity.x, velocity.z) - facing therefore reports a step
   to the right as -pi/2, the mirror of what every clip table here means. Taking
   the angle from the actor-space components leaves the sign to the basis. */
export function travelAngleOf(movement: PlaneVector, facingRadians: number): number {
  const local = movementInActorSpace(movement, facingRadians)
  if (Math.hypot(local.x, local.z) < 1e-4) return 0
  return Math.atan2(local.x, local.z)
}

function normalizedPlane(vector: PlaneVector): PlaneVector | null {
  const length = Math.hypot(vector.x, vector.z)
  if (length < 1e-4) return null
  return { x: vector.x / length, z: vector.z / length }
}

function diagonalOf(movement: PlaneVector): LocomotionDirection {
  if (movement.z > 0) return movement.x > 0 ? 'forward-right' : 'forward-left'
  return movement.x > 0 ? 'backward-right' : 'backward-left'
}

export function locomotionDirectionOf(localMovement: PlaneVector): LocomotionDirection {
  const movement = normalizedPlane(localMovement)
  if (!movement) return 'idle'

  const sideways = Math.abs(movement.x) > DIAGONAL_THRESHOLD
  const lengthwise = Math.abs(movement.z) > DIAGONAL_THRESHOLD
  if (sideways && lengthwise) return diagonalOf(movement)
  if (lengthwise) return movement.z > 0 ? 'forward' : 'backward'
  return movement.x > 0 ? 'right' : 'left'
}
