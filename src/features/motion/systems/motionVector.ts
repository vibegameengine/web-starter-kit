import type { Vector3Tuple } from './boxTrace'

export const UP: Vector3Tuple = [0, 1, 0]

export function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function scaled(vector: Vector3Tuple, factor: number): Vector3Tuple {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor]
}

export function normalized(vector: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(vector[0], vector[1], vector[2])
  return length === 0 ? [0, 0, 0] : scaled(vector, 1 / length)
}

export function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function advanceAlong(from: Vector3Tuple, to: Vector3Tuple, fraction: number): Vector3Tuple {
  return [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction,
    from[2] + (to[2] - from[2]) * fraction,
  ]
}

export function offsetY(position: Vector3Tuple, amount: number): Vector3Tuple {
  return [position[0], position[1] + amount, position[2]]
}
