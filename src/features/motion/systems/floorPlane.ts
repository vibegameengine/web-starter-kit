import { springStep, type Spring } from './springInterp'

export type FloorState = {
  readonly height: number
  readonly velocity: number
}

export const FLOOR_SPRING: Spring = { damping: 1, stiffness: 1000 }
export const MAX_GROUND_PENETRATION = 0.1

export function followFloor(state: FloorState | null, ground: number, deltaSeconds: number, beneath?: number | null, penetration?: number): FloorState
export function followFloor(state: FloorState | null, ground: number | null, deltaSeconds: number, beneath?: number | null, penetration?: number): FloorState | null
export function followFloor(
  state: FloorState | null,
  ground: number | null,
  deltaSeconds: number,
  beneath: number | null = ground,
  penetration: number = MAX_GROUND_PENETRATION,
): FloorState | null {
  if (ground === null) return state
  if (state === null) return { height: beneath ?? ground, velocity: 0 }
  const sprung = springStep({ value: state.height, velocity: state.velocity }, ground, FLOOR_SPRING, deltaSeconds)
  if (beneath === null || sprung.value >= beneath - penetration) return { height: sprung.value, velocity: sprung.velocity }
  return { height: beneath - penetration, velocity: Math.max(0, sprung.velocity) }
}

export const FLOOR_LOOKAHEAD_SECONDS = 4.7 / Math.sqrt(FLOOR_SPRING.stiffness)

export function pointAhead(
  point: readonly [number, number],
  previous: readonly [number, number] | null,
  deltaSeconds: number,
): [number, number] {
  if (!previous || deltaSeconds <= 0) return [point[0], point[1]]
  const scale = FLOOR_LOOKAHEAD_SECONDS / deltaSeconds
  return [point[0] + (point[0] - previous[0]) * scale, point[1] + (point[1] - previous[1]) * scale]
}
