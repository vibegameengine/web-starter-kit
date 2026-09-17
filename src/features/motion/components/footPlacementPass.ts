import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import { aimBoneAlong } from '../../../shared/lib/animation/boneAim'
import { PLANT_RELEASE_TWIST_RADIANS } from '../../../shared/lib/animation/jointLimits'
import { shortestAngle } from '../systems/angles'
import { solveTwoBoneIk, type TwoBoneChain } from '../../../shared/lib/animation/twoBoneIk'
import type { TraceBox } from '../systems/boxTrace'
import { stanceGround, type GroundSample } from '../systems/footGround'
import {
  approachWeight,
  DEFAULT_MAX_HOLD,
  moveToward,
  DEFAULT_PLANT_MARGIN,
  DEFAULT_SWING_MARGIN,
  footContactWeight,
  holdWeight,
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
  footSpeed: number
  hold: number
  lockFacing: number
  releasing: boolean
  plant: PlantState
  previousFoot: Vector3 | null
  wasStance: boolean
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

export const KNEE_POLE_DISTANCE = 0.8

export const HOLD_RATE = 9

const REACH_SHARE = 0.985

const RELEASE_SHARE = 0.9

const UP = new Vector3(0, 1, 0)

const scratch = {
  foot: new Vector3(),
  hip: new Vector3(),
  knee: new Vector3(),
  pole: new Vector3(),
  tilt: new Quaternion(),
  toe: new Vector3(),
}

function hitOf(sample: GroundSample | null): GroundHit | null {
  if (!sample) return null
  return { normal: new Vector3(sample.normal[0], sample.normal[1], sample.normal[2]), surfaceY: sample.surfaceY }
}

export function footSpeedOf(state: LegState, foot: Vector3, travel: number, bodySpeed: number): number {
  const previous = state.previousFoot
  if (!previous) {
    state.previousFoot = foot.clone()
    return 0
  }
  if (travel <= 1e-4) return state.footSpeed
  const drift = Math.hypot(foot.x - previous.x, foot.z - previous.z)
  previous.copy(foot)
  return (drift / travel) * bodySpeed
}

/* @important The solver must never be handed a target the leg cannot reach:
   that is what stretched a shin through the floor at a ledge. Pull the target
   in along the line from the hip until it sits inside the leg span. */
export function withinReach(hip: Vector3, target: Vector3, chain: TwoBoneChain): Vector3 {
  const reach = (chain.lowerLength + chain.upperLength) * REACH_SHARE
  const distance = hip.distanceTo(target)
  if (distance <= reach) return target
  return target.sub(hip).multiplyScalar(reach / distance).add(hip)
}

export type FootStepInput = {
  readonly bodyForward: Vector3
  readonly facingRadians: number
  readonly bodyPosition: readonly [number, number]
  readonly bodySpeed: number
  readonly chain: TwoBoneChain
  readonly deltaSeconds: number
  readonly groundReference: number
  readonly leg: LegBones
  readonly stance: boolean
  readonly state: LegState
  readonly strideScale: number
  readonly trace: TraceBox
  readonly travelDelta: number
  readonly tuning: FootPlacementTuning
}

/* @important The lock takes hold at once on the rising edge of stance, at the
   place the clip itself put the foot: there is nothing to ease into, because the
   lock point and the animated foot are the same point on that frame. Easing the
   weight up instead let the foot skate five centimetres through heel strike
   while the clip carried it forward. Only the release is rate limited. */
type HoldInput = {
  readonly chain: TwoBoneChain
  readonly deltaSeconds: number
  readonly facingRadians: number
  readonly hip: Vector3
  readonly stance: boolean
  readonly state: LegState
  readonly target: Vector3
}

function outOfReach(hip: Vector3, state: LegState, chain: TwoBoneChain): boolean {
  if (!state.plant.locked) return false
  const span = Math.hypot(hip.x - state.plant.lockX, hip.z - state.plant.lockZ)
  return span > (chain.lowerLength + chain.upperLength) * RELEASE_SHARE
}

function twistedOff(state: LegState, facingRadians: number): boolean {
  if (!state.plant.locked) return false
  return Math.abs(shortestAngle(state.lockFacing, facingRadians)) > PLANT_RELEASE_TWIST_RADIANS
}

/* @important A hard release has to ease like any other: cutting the hold from
   one to zero on the frame the lock goes out of reach snapped the foot half a
   metre to wherever the clip had carried it. While releasing, the lock is not
   renewed and the weight runs down at the same rate it would fade on drift, so
   the foot rejoins the animation instead of teleporting onto it. */
function holdOnPlant({ chain, deltaSeconds, facingRadians, hip, stance, state, target }: HoldInput): void {
  if (outOfReach(hip, state, chain) || twistedOff(state, facingRadians)) state.releasing = true
  if (stance && !state.wasStance) {
    state.plant = { lockX: target.x, lockZ: target.z, locked: true, weight: 1 }
    state.hold = 1
    state.lockFacing = facingRadians
    state.releasing = false
  }
  state.wasStance = stance
  const drift = Math.hypot(target.x - state.plant.lockX, target.z - state.plant.lockZ)
  const wanted = state.releasing ? 0 : holdWeight(stance, drift, DEFAULT_MAX_HOLD)
  state.hold = moveToward(state.hold, wanted, HOLD_RATE * deltaSeconds)
  state.plant = { ...state.plant, locked: state.hold > 0.01, weight: state.hold }
  target.setX(target.x + (state.plant.lockX - target.x) * state.hold)
  target.setZ(target.z + (state.plant.lockZ - target.z) * state.hold)
}

function contactFor(input: FootStepInput, ground: GroundHit | null, footY: number): number {
  if (!ground) return 0
  return footContactWeight({
    ankleHeight: input.tuning.ankleHeight,
    footY,
    maxStepDrop: input.tuning.maxStepDrop,
    plantMargin: DEFAULT_PLANT_MARGIN,
    stance: input.stance,
    surfaceY: ground.surfaceY,
    swingMargin: DEFAULT_SWING_MARGIN,
  })
}

export function stepFoot(input: FootStepInput): FootStep {
  const { bodyForward, bodyPosition, bodySpeed, chain, deltaSeconds, groundReference } = input
  const { leg, stance, state, strideScale, trace, travelDelta, tuning } = input
  leg.foot.getWorldPosition(scratch.foot)
  leg.thigh.getWorldPosition(scratch.hip)
  const found = stanceGround(
    [scratch.foot.x, scratch.foot.y, scratch.foot.z],
    bodyPosition,
    trace,
    tuning.maxStepDrop,
  )
  if (stance) scratch.foot.setX(found.pulledX).setZ(found.pulledZ)
  const ground = hitOf(found.ground)
  state.footSpeed = footSpeedOf(state, scratch.foot, travelDelta, bodySpeed)
  state.contact = approachWeight(
    state.contact,
    contactFor(input, ground, scratch.foot.y),
    tuning.contactRate,
    deltaSeconds,
  )

  const surfaceDelta = ground ? ground.surfaceY - groundReference : 0
  state.correction = approachWeight(
    state.correction,
    surfaceDelta * state.contact,
    tuning.correctionRate,
    deltaSeconds,
  )

  const target = new Vector3(scratch.foot.x, scratch.foot.y + state.correction, scratch.foot.z)
  if (Math.abs(strideScale - 1) > 0.01) {
    warpedFootTarget(target, scratch.hip, bodyForward, strideScale, target)
  }
  holdOnPlant({ chain, deltaSeconds, facingRadians: input.facingRadians, hip: scratch.hip, stance, state, target })

  return { contact: state.contact, ground, surfaceDelta, target: withinReach(scratch.hip, target, chain) }
}

export function writeLeg(leg: LegBones, target: Vector3, chain: TwoBoneChain, bodyForward: Vector3): void {
  leg.thigh.getWorldPosition(scratch.hip)
  leg.knee.getWorldPosition(scratch.knee)
  scratch.pole.copy(scratch.knee).addScaledVector(bodyForward, KNEE_POLE_DISTANCE)
  const reached = withinReach(scratch.hip, target, chain)
  const solved = solveTwoBoneIk(scratch.hip, scratch.knee, reached, chain, scratch.pole)

  aimBoneAlong(leg.thigh, scratch.knee.clone().sub(scratch.hip), solved.mid.clone().sub(scratch.hip))
  leg.thigh.updateMatrixWorld(true)
  leg.knee.getWorldPosition(scratch.knee)
  leg.foot.getWorldPosition(scratch.toe)
  aimBoneAlong(leg.knee, scratch.toe.clone().sub(scratch.knee), solved.tip.clone().sub(scratch.knee))
  leg.knee.updateMatrixWorld(true)
}

export function tiltFootToGround(leg: LegBones, normal: Vector3, contact: number): void {
  if (contact < 0.01 || normal.dot(UP) > 0.999) return
  const parent = leg.foot.parent
  if (!parent) return
  scratch.tilt.setFromUnitVectors(UP, normal)
  const world = leg.foot.getWorldQuaternion(new Quaternion())
  const tilted = scratch.tilt.clone().multiply(world)
  const inverseParent = parent.getWorldQuaternion(new Quaternion()).invert()
  leg.foot.quaternion.slerp(inverseParent.multiply(tilted), contact)
}

export function dropPelvis(hips: Object3D, rig: Object3D, drop: number): void {
  if (drop <= 0.001) return
  hips.getWorldPosition(scratch.hip)
  scratch.hip.setY(scratch.hip.y - drop)
  hips.parent?.worldToLocal(scratch.hip)
  hips.position.copy(scratch.hip)
  rig.updateMatrixWorld(true)
}
