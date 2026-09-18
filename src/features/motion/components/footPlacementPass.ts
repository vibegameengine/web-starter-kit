import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import { aimBoneAlong } from '../../../shared/lib/animation/boneAim'
import { PLANT_RELEASE_TWIST_RADIANS } from '../../../shared/lib/animation/jointLimits'
import { shortestAngle } from '../systems/angles'
import { solveTwoBoneIk, type TwoBoneChain } from '../../../shared/lib/animation/twoBoneIk'
import type { TraceBox } from '../systems/boxTrace'
import { reachableDrop, stanceGround, type GroundSample } from '../systems/footGround'
import {
  approachWeight,
  DEFAULT_MAX_HOLD,
  MAX_SMOOTHING_SECONDS,
  moveToward,
  DEFAULT_PLANT_MARGIN,
  DEFAULT_SWING_MARGIN,
  footContactWeight,
  holdWeight,
  type PlantState,
} from '../systems/footPlanting'
import { levelledFoot } from '../systems/footOrientation'
import type { LimbReach } from '../systems/pelvisSolve'
import { warpedFootTarget } from '../systems/strideWarp'

export type LegBones = {
  readonly foot: Object3D
  readonly knee: Object3D
  readonly restFoot: Quaternion
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
  readonly reach: LimbReach
  readonly surfaceDelta: number
  readonly target: Vector3
}

export const HOLD_RATE = 9

const REACH_SHARE = 0.985

const RELEASE_SHARE = 0.9

const UP = new Vector3(0, 1, 0)

const scratch = {
  foot: new Vector3(),
  footWorld: new Quaternion(),
  parentWorld: new Quaternion(),
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

/* @important The pole is a DIRECTION the knee bends toward, not a place it
   should aim at. Handing the solver the knee's world position plus a forward
   step read as "bend toward the world origin", and the further the body walked
   from the origin the more completely that swamped the forward it was meant to
   carry: at two metres out the bend direction was already twice as much toward
   the origin as forward, and the knee turned inward or backward. Near the
   origin it looks right, which is why nothing caught it for so long. */
export function kneePole(bodyForward: Vector3): Vector3 {
  return scratch.pole.copy(bodyForward)
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
  readonly standing: boolean
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
  readonly standing: boolean
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
function holdOnPlant({ chain, deltaSeconds, facingRadians, hip, stance, standing, state, target }: HoldInput): void {
  if (outOfReach(hip, state, chain) || twistedOff(state, facingRadians) || standing) state.releasing = true
  if (stance && !standing && !state.wasStance) {
    state.plant = { lockX: target.x, lockZ: target.z, locked: true, weight: 1 }
    state.hold = 1
    state.lockFacing = facingRadians
    state.releasing = false
  }
  state.wasStance = stance && !standing
  const drift = Math.hypot(target.x - state.plant.lockX, target.z - state.plant.lockZ)
  const wanted = state.releasing || standing ? 0 : holdWeight(stance, drift, DEFAULT_MAX_HOLD)
  state.hold = moveToward(state.hold, wanted, HOLD_RATE * Math.min(deltaSeconds, MAX_SMOOTHING_SECONDS))
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
    Math.min(tuning.maxStepDrop, reachableDrop(chain, scratch.hip.y - scratch.foot.y)),
  )
  /* @important Standing on the lip of a ledge is exactly when a foot has to be
     pulled back over solid ground: the leg cannot reach the pit beside the
     block, and leaving the target out there hangs the foot in the air. Unreal
     does the same adjustment horizontally before it moves the pelvis at all. */
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
  holdOnPlant({
    chain,
    deltaSeconds,
    facingRadians: input.facingRadians,
    hip: scratch.hip,
    stance,
    standing: input.standing,
    state,
    target,
  })

  return {
    contact: state.contact,
    ground,
    reach: {
      desiredExtension: scratch.hip.distanceTo(scratch.foot),
      hipHeight: scratch.hip.y,
      horizontalToPlant: Math.hypot(target.x - scratch.hip.x, target.z - scratch.hip.z),
      limbLength: chain.lowerLength + chain.upperLength,
      plantHeight: target.y,
    },
    surfaceDelta,
    target: withinReach(scratch.hip, target, chain),
  }
}

export function writeLeg(leg: LegBones, target: Vector3, chain: TwoBoneChain, bodyForward: Vector3): void {
  leg.thigh.getWorldPosition(scratch.hip)
  leg.knee.getWorldPosition(scratch.knee)
  const reached = withinReach(scratch.hip, target, chain)
  const solved = solveTwoBoneIk(scratch.hip, scratch.knee, reached, chain, kneePole(bodyForward))

  aimBoneAlong(leg.thigh, scratch.knee.clone().sub(scratch.hip), solved.mid.clone().sub(scratch.hip))
  leg.thigh.updateMatrixWorld(true)
  leg.knee.getWorldPosition(scratch.knee)
  leg.foot.getWorldPosition(scratch.toe)
  aimBoneAlong(leg.knee, scratch.toe.clone().sub(scratch.knee), solved.tip.clone().sub(scratch.knee))
  leg.knee.updateMatrixWorld(true)
}

/* @important The clip rolls the foot heel to toe through a stride and that roll
   is the animation, so it is left alone while the body walks. Standing is the
   case nothing owned: there the sole is put flat on whatever is under it, which
   is why the character no longer stands on its toes. On a slope the levelling
   applies either way — a sole cannot lie flat on a hill by accident. */
export function levelFootToGround(
  leg: LegBones,
  normal: Vector3,
  contact: number,
  standing: boolean,
): void {
  const parent = leg.foot.parent
  const onSlope = normal.dot(UP) <= 0.999
  if (contact < 0.01 || !parent || (!standing && !onSlope)) return
  const world = leg.foot.getWorldQuaternion(scratch.footWorld)
  const levelled = levelledFoot(world, leg.restFoot, normal, contact)
  const inverseParent = parent.getWorldQuaternion(scratch.parentWorld).invert()
  leg.foot.quaternion.copy(inverseParent.multiply(levelled))
  leg.foot.updateMatrixWorld(true)
}

export function dropPelvis(hips: Object3D, rig: Object3D, drop: number): void {
  if (drop <= 0.001) return
  hips.getWorldPosition(scratch.hip)
  scratch.hip.setY(scratch.hip.y - drop)
  hips.parent?.worldToLocal(scratch.hip)
  hips.position.copy(scratch.hip)
  rig.updateMatrixWorld(true)
}
