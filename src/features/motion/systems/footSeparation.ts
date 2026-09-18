import { springStep, type Spring } from './springInterp'

export type PlanePoint = readonly [number, number]

export type FeetPair = {
  readonly animated: readonly [PlanePoint, PlanePoint]
  readonly holds: readonly [number, number]
  readonly side: PlanePoint
  readonly solved: readonly [PlanePoint, PlanePoint]
}

export type SeparationState = {
  readonly offset: PlanePoint
  readonly velocity: PlanePoint
}

export const SEPARATING_DISTANCE = 0.05
export const RESTING_SEPARATION: SeparationState = { offset: [0, 0], velocity: [0, 0] }
export const SEPARATION_SPRING: Spring = { damping: 1, stiffness: 1000 }

function gapAlong(pair: readonly [PlanePoint, PlanePoint], side: PlanePoint): number {
  return (pair[0][0] - pair[1][0]) * side[0] + (pair[0][1] - pair[1][1]) * side[1]
}

function unitSide(feet: FeetPair): PlanePoint | null {
  const length = Math.hypot(feet.side[0], feet.side[1])
  return length < 1e-6 ? null : [feet.side[0] / length, feet.side[1] / length]
}

function deficitOf(feet: FeetPair, side: PlanePoint): number {
  const required = Math.min(gapAlong(feet.animated, side), 2 * SEPARATING_DISTANCE)
  return required - gapAlong(feet.solved, side)
}

export function crossingRelease(feet: FeetPair): [boolean, boolean] {
  const side = unitSide(feet)
  if (!side || deficitOf(feet, side) <= 0) return [false, false]
  const along = (point: PlanePoint) => point[0] * side[0] + point[1] * side[1]
  const locked = (leg: number) => feet.holds[leg] >= 0.5
  const leftInward = locked(0) ? along(feet.animated[0]) - along(feet.solved[0]) : 0
  const rightInward = locked(1) ? along(feet.solved[1]) - along(feet.animated[1]) : 0
  if (Math.max(leftInward, rightInward) <= SEPARATING_DISTANCE) return [false, false]
  return leftInward >= rightInward ? [true, false] : [false, true]
}

export function mutualSeparation(feet: FeetPair): [PlanePoint, PlanePoint] {
  const side = unitSide(feet)
  if (!side) return [[0, 0], [0, 0]]
  const deficit = deficitOf(feet, side)
  const free = [1 - feet.holds[0], 1 - feet.holds[1]]
  const total = free[0] + free[1]
  if (deficit <= 0 || total < 1e-3) return [[0, 0], [0, 0]]
  const left = (deficit * free[0]) / total
  const right = -(deficit * free[1]) / total
  return [[side[0] * left, side[1] * left], [side[0] * right, side[1] * right]]
}

export function springSeparation(state: SeparationState, wanted: PlanePoint, deltaSeconds: number): SeparationState {
  const x = springStep({ value: state.offset[0], velocity: state.velocity[0] }, wanted[0], SEPARATION_SPRING, deltaSeconds)
  const z = springStep({ value: state.offset[1], velocity: state.velocity[1] }, wanted[1], SEPARATION_SPRING, deltaSeconds)
  return { offset: [x.value, z.value], velocity: [x.velocity, z.velocity] }
}
