import { clampNumber } from './angles'

export type FootContactInput = {
  readonly ankleHeight: number
  readonly footY: number
  readonly plantMargin: number
  readonly surfaceY: number
  readonly swingMargin: number
}

export type PlantState = {
  readonly lockX: number
  readonly lockZ: number
  readonly locked: boolean
  readonly weight: number
}

export type PlantUpdate = {
  readonly contact: number
  readonly footX: number
  readonly footZ: number
  readonly hipX: number
  readonly hipZ: number
  readonly reach: number
  readonly state: PlantState
}

export const DEFAULT_PLANT_MARGIN = 0.06

export const DEFAULT_SWING_MARGIN = 0.22

export const NO_PLANT: PlantState = { lockX: 0, lockZ: 0, locked: false, weight: 0 }

export function contactWeight({
  ankleHeight,
  footY,
  plantMargin,
  surfaceY,
  swingMargin,
}: FootContactInput): number {
  const above = footY - (surfaceY + ankleHeight)
  if (above <= plantMargin) return 1
  if (above >= swingMargin) return 0
  return 1 - (above - plantMargin) / (swingMargin - plantMargin)
}

export function approachWeight(current: number, wanted: number, rate: number, deltaSeconds: number): number {
  const share = clampNumber(rate * deltaSeconds, 0, 1)
  return current + (wanted - current) * share
}

export function updatePlant({
  contact,
  footX,
  footZ,
  hipX,
  hipZ,
  reach,
  state,
}: PlantUpdate): PlantState {
  if (contact <= 0) return { ...state, locked: false, weight: 0 }

  if (!state.locked) return { lockX: footX, lockZ: footZ, locked: true, weight: contact }

  const stretched = Math.hypot(state.lockX - hipX, state.lockZ - hipZ) > reach
  if (stretched) return { lockX: footX, lockZ: footZ, locked: true, weight: contact }

  return { ...state, weight: contact }
}

export function plantedTarget(
  state: PlantState,
  animated: readonly [number, number, number],
  surfaceY: number,
  ankleHeight: number,
): readonly [number, number, number] {
  if (!state.locked || state.weight <= 0) return animated
  const groundedY = Math.max(animated[1], surfaceY + ankleHeight)
  return [
    animated[0] + (state.lockX - animated[0]) * state.weight,
    groundedY,
    animated[2] + (state.lockZ - animated[2]) * state.weight,
  ]
}

export function pelvisDropFor(overReach: readonly number[], maxStepDrop: number): number {
  let deepest = 0
  for (const value of overReach) {
    if (value > deepest) deepest = value
  }
  return Math.min(deepest, maxStepDrop)
}
