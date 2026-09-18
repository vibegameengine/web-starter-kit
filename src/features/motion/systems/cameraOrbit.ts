import { clampNumber } from './angles'
import type { Vector3Tuple } from './boxTrace'

export type OrbitState = {
  readonly distance: number
  readonly pitchRadians: number
  readonly yawRadians: number
}

export const MIN_ORBIT_PITCH = -0.55

export const MAX_ORBIT_PITCH = 1.25

export const MIN_ORBIT_DISTANCE = 1.4

export const MAX_ORBIT_DISTANCE = 7

export const ORBIT_ZOOM_PER_NOTCH = 0.6

export const MOUSE_RADIANS_PER_PIXEL = 0.0032

export function clampOrbitPitch(pitchRadians: number): number {
  return clampNumber(pitchRadians, MIN_ORBIT_PITCH, MAX_ORBIT_PITCH)
}

export function zoomedDistance(distance: number, notches: number): number {
  return clampNumber(distance + notches * ORBIT_ZOOM_PER_NOTCH, MIN_ORBIT_DISTANCE, MAX_ORBIT_DISTANCE)
}

/* @important The camera sits behind the yaw it is given, which is the same yaw
   the movement intent is read against: hold forward and the body runs away from
   the camera, whichever way the camera has been turned. */
export function orbitOffset({ distance, pitchRadians, yawRadians }: OrbitState): Vector3Tuple {
  const flat = Math.cos(pitchRadians) * distance
  return [-Math.sin(yawRadians) * flat, Math.sin(pitchRadians) * distance, -Math.cos(yawRadians) * flat]
}

export function orbitFromMouse(state: OrbitState, movementX: number, movementY: number): OrbitState {
  return {
    distance: state.distance,
    pitchRadians: clampOrbitPitch(state.pitchRadians + movementY * MOUSE_RADIANS_PER_PIXEL),
    yawRadians: state.yawRadians - movementX * MOUSE_RADIANS_PER_PIXEL,
  }
}
