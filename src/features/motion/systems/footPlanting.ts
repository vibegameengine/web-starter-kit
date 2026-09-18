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

export function smoothStep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = clampNumber((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export const STANCE_FADE_RANGE = 0.3

/* @important Contact comes from the stance window and the gap to the ground,
   never from a measured foot speed: a speed read over render frames goes to
   zero between simulation ticks, which lifted both feet into full contact at
   once and let the solver haul both legs at the same time. A stance foot keeps
   full contact until its ground is further away than the leg can reach; a swing
   foot fades out by height so it keeps the clip's own motion. */
export function footContactWeight({
  ankleHeight,
  footY,
  maxStepDrop,
  plantMargin,
  stance,
  surfaceY,
  swingMargin,
}: FootContactInput & { readonly maxStepDrop: number; readonly stance: boolean }): number {
  const gap = footY - surfaceY
  if (!stance) return contactWeight({ ankleHeight, footY, plantMargin, surfaceY, swingMargin })
  const reachedFor = Math.max(0, gap - ankleHeight)
  return 1 - smoothStep(maxStepDrop, maxStepDrop + STANCE_FADE_RANGE, reachedFor)
}

export const DEFAULT_MAX_HOLD = 0.9

export function holdWeight(stance: boolean, drift: number, maxHold: number): number {
  if (!stance) return 0
  return 1 - smoothStep(maxHold * 0.5, maxHold, drift)
}

export function moveToward(current: number, wanted: number, step: number): number {
  const gap = wanted - current
  if (Math.abs(gap) <= step) return wanted
  return current + Math.sign(gap) * step
}

export const MAX_SMOOTHING_SECONDS = 0.1

/* @important The delta is clamped before it smooths anything. A render frame is
   not a simulation tick: on a bench that steps one tick per click the render
   delta is a tenth of a second and every eased value arrives in a single frame,
   and after a hitch in the game the same thing happens on screen. notapain
   clamps the same way, for the same reason. */
export function approachWeight(current: number, wanted: number, rate: number, deltaSeconds: number): number {
  const share = clampNumber(rate * Math.min(deltaSeconds, MAX_SMOOTHING_SECONDS), 0, 1)
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

export type PlantIntentInput = {
  readonly distanceToGround: number
  readonly footSpeed: number
  readonly plantDistance: number
  readonly speedThreshold: number
}

export const DEFAULT_PLANT_DISTANCE = 0.12

export const DEFAULT_PLANT_SPEED = 0.35

export const DEFAULT_UNALIGN_SPEED = 1.2

export function wantsToPlant({
  distanceToGround,
  footSpeed,
  plantDistance,
  speedThreshold,
}: PlantIntentInput): boolean {
  return distanceToGround < plantDistance && footSpeed < speedThreshold
}

export type PlantHysteresis = {
  readonly replantRadius: number
  readonly unplantRadius: number
}

export const DEFAULT_PLANT_HYSTERESIS: PlantHysteresis = { replantRadius: 0.06, unplantRadius: 0.22 }

export type PlantDecision = 'planted' | 'replanted' | 'unplanted'

export type PlantDecisionInput = {
  readonly drift: number
  readonly hysteresis: PlantHysteresis
  readonly wantsToPlant: boolean
  readonly wasPlanted: boolean
  readonly wantedToPlant: boolean
}

export function plantDecision({
  drift,
  hysteresis,
  wantedToPlant,
  wantsToPlant: wants,
  wasPlanted,
}: PlantDecisionInput): PlantDecision {
  if (!wants) return 'unplanted'
  if (wasPlanted) return drift > hysteresis.unplantRadius ? 'unplanted' : 'planted'
  if (!wantedToPlant) return 'planted'
  return drift <= hysteresis.replantRadius ? 'replanted' : 'unplanted'
}

export function alignmentAlpha(footSpeed: number, unalignSpeed: number, plantSpeed: number): number {
  if (unalignSpeed <= plantSpeed) return footSpeed <= plantSpeed ? 1 : 0
  return clampNumber((unalignSpeed - footSpeed) / (unalignSpeed - plantSpeed), 0, 1)
}

export function pelvisDropFor(overReach: readonly number[], maxStepDrop: number): number {
  let deepest = 0
  for (const value of overReach) {
    if (value > deepest) deepest = value
  }
  return Math.min(deepest, maxStepDrop)
}
