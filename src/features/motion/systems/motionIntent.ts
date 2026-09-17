import type { Vector3Tuple } from './boxTrace'

export type MotionIntent = {
  readonly crouch: boolean
  readonly forward: number
  readonly jump: boolean
  readonly right: number
  readonly sprint: boolean
  readonly yaw: number
}

export const IDLE_MOTION_INTENT: MotionIntent = {
  crouch: false,
  forward: 0,
  jump: false,
  right: 0,
  sprint: false,
  yaw: 0,
}

export type PlaneVector = { readonly x: number; readonly z: number }

export function yawForward(yaw: number): PlaneVector {
  return { x: Math.sin(yaw), z: Math.cos(yaw) }
}

export function yawRight(yaw: number): PlaneVector {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) }
}

export function intentWishDirection(intent: MotionIntent): PlaneVector {
  const forward = yawForward(intent.yaw)
  const right = yawRight(intent.yaw)
  const x = forward.x * intent.forward + right.x * intent.right
  const z = forward.z * intent.forward + right.z * intent.right
  const length = Math.hypot(x, z)
  if (length < 1e-6) return { x: 0, z: 0 }
  return { x: x / length, z: z / length }
}

export function intentDeflection(intent: MotionIntent): number {
  return Math.min(1, Math.max(Math.abs(intent.forward), Math.abs(intent.right)))
}

export function horizontalSpeed(velocity: Vector3Tuple): number {
  return Math.hypot(velocity[0], velocity[2])
}
