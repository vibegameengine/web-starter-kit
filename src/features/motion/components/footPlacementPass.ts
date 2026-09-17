import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import { aimBoneAlong } from '../../../shared/lib/animation/boneAim'
import { solveTwoBoneIk, type TwoBoneChain } from '../../../shared/lib/animation/twoBoneIk'
import type { TraceBox, Vector3Tuple } from '../systems/boxTrace'
import {
  approachWeight,
  contactWeight,
  DEFAULT_PLANT_MARGIN,
  DEFAULT_SWING_MARGIN,
  plantedTarget,
  updatePlant,
  type PlantState,
} from '../systems/footPlanting'
import { warpedFootTarget } from '../systems/strideWarp'

export type LegBones = {
  readonly foot: Object3D
  readonly knee: Object3D
  readonly thigh: Object3D
}

export type LegState = {
  contact: number
  correction: number
  plant: PlantState
}

export type GroundHit = {
  readonly normal: Vector3
  readonly surfaceY: number
}

export type FootPlacementTuning = {
  readonly ankleHeight: number
  readonly contactRate: number
  readonly correctionRate: number
  readonly maxStepDrop: number
}

export type FootStep = {
  readonly contact: number
  readonly ground: GroundHit | null
  readonly surfaceDelta: number
  readonly target: Vector3
}

export const GROUND_PROBE_HALF_EXTENTS: Vector3Tuple = [0.02, 0.02, 0.02]

export const GROUND_PROBE_RISE = 0.5

export const GROUND_PROBE_DROP = 0.8

export const KNEE_POLE_DISTANCE = 0.8

const UP = new Vector3(0, 1, 0)

const scratch = {
  foot: new Vector3(),
  hip: new Vector3(),
  knee: new Vector3(),
  pole: new Vector3(),
  tilt: new Quaternion(),
  toe: new Vector3(),
}

export function groundUnder(point: Vector3, trace: TraceBox): GroundHit | null {
  const from: Vector3Tuple = [point.x, point.y + GROUND_PROBE_RISE, point.z]
  const to: Vector3Tuple = [from[0], from[1] - GROUND_PROBE_DROP, from[2]]
  const hit = trace(from, to, GROUND_PROBE_HALF_EXTENTS)
  if (!hit.hit || hit.startSolid) return null
  return {
    normal: new Vector3(hit.normal[0], hit.normal[1], hit.normal[2]),
    surfaceY: from[1] - GROUND_PROBE_DROP * hit.fraction - GROUND_PROBE_HALF_EXTENTS[1],
  }
}

export function contactTargetFor(
  stance: boolean,
  footY: number,
  ground: GroundHit,
  tuning: FootPlacementTuning,
): number {
  if (stance) {
    const over = Math.max(0, footY - ground.surfaceY - tuning.ankleHeight - tuning.maxStepDrop)
    return Math.max(0, 1 - over / 0.3)
  }
  return contactWeight({
    ankleHeight: tuning.ankleHeight,
    footY,
    plantMargin: DEFAULT_PLANT_MARGIN,
    surfaceY: ground.surfaceY,
    swingMargin: DEFAULT_SWING_MARGIN,
  })
}

export type FootStepInput = {
  readonly chain: TwoBoneChain
  readonly deltaSeconds: number
  readonly groundReference: number
  readonly leg: LegBones
  readonly stance: boolean
  readonly state: LegState
  readonly strideDirection: Vector3
  readonly strideScale: number
  readonly trace: TraceBox
  readonly tuning: FootPlacementTuning
}

export function stepFoot(input: FootStepInput): FootStep {
  const { chain, deltaSeconds, groundReference, leg, stance, state, strideDirection, strideScale, trace, tuning } = input
  leg.foot.getWorldPosition(scratch.foot)
  leg.thigh.getWorldPosition(scratch.hip)
  const ground = groundUnder(scratch.foot, trace)

  const wanted = ground ? contactTargetFor(stance, scratch.foot.y, ground, tuning) : 0
  state.contact = approachWeight(state.contact, wanted, tuning.contactRate, deltaSeconds)

  const surfaceDelta = ground ? ground.surfaceY - groundReference : 0
  state.correction = approachWeight(
    state.correction,
    surfaceDelta * state.contact,
    tuning.correctionRate,
    deltaSeconds,
  )

  const target = new Vector3(scratch.foot.x, scratch.foot.y + state.correction, scratch.foot.z)
  if (Math.abs(strideScale - 1) > 0.01) {
    warpedFootTarget(target, scratch.hip, strideDirection, strideScale, target)
  }

  state.plant = updatePlant({
    contact: stance ? state.contact : 0,
    footX: target.x,
    footZ: target.z,
    hipX: scratch.hip.x,
    hipZ: scratch.hip.z,
    reach: chain.lowerLength + chain.upperLength,
    state: state.plant,
  })
  const placed = plantedTarget(
    state.plant,
    [target.x, target.y, target.z],
    ground ? ground.surfaceY : target.y - tuning.ankleHeight,
    tuning.ankleHeight,
  )

  return {
    contact: state.contact,
    ground,
    surfaceDelta,
    target: target.set(placed[0], placed[1], placed[2]),
  }
}

export function writeLeg(leg: LegBones, target: Vector3, chain: TwoBoneChain, strideDirection: Vector3): void {
  leg.thigh.getWorldPosition(scratch.hip)
  leg.knee.getWorldPosition(scratch.knee)
  scratch.pole.copy(scratch.knee).addScaledVector(strideDirection, KNEE_POLE_DISTANCE)
  const solved = solveTwoBoneIk(scratch.hip, scratch.knee, target, chain, scratch.pole)

  aimBoneAlong(leg.thigh, scratch.knee.clone().sub(scratch.hip), solved.mid.clone().sub(scratch.hip))
  leg.thigh.updateMatrixWorld(true)
  leg.knee.getWorldPosition(scratch.knee)
  leg.foot.getWorldPosition(scratch.toe)
  aimBoneAlong(leg.knee, scratch.toe.clone().sub(scratch.knee), solved.tip.clone().sub(scratch.knee))
  leg.knee.updateMatrixWorld(true)
}

export function tiltFootToGround(leg: LegBones, normal: Vector3, contact: number): void {
  if (contact < 0.01 || normal.dot(UP) > 0.999) return
  scratch.tilt.setFromUnitVectors(UP, normal)
  leg.foot.quaternion.slerp(scratch.tilt.multiply(leg.foot.quaternion), contact)
}

export function dropPelvis(hips: Object3D, rig: Object3D, drop: number): void {
  if (drop <= 0.001) return
  hips.getWorldPosition(scratch.hip)
  scratch.hip.setY(scratch.hip.y - drop)
  hips.parent?.worldToLocal(scratch.hip)
  hips.position.copy(scratch.hip)
  rig.updateMatrixWorld(true)
}
