import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import { aimBoneAlong } from '../../../shared/lib/animation/boneAim'
import { solveTwoBoneIk, type TwoBoneChain } from '../../../shared/lib/animation/twoBoneIk'
import type { TraceBox } from '../systems/boxTrace'
import { groundUnder, type GroundSample } from '../systems/footGround'
import { levelledFoot } from '../systems/footOrientation'
import { smoothStep } from '../systems/footPlanting'
import { localDropOffset } from '../systems/pelvisOffset'

/* @important This pass is a port of notapain's foot_ik_prep.gd, algorithm and
   constants both, and it is meant to stay one. The version before it grew its
   own ideas on top — a reach clamp, a ball pivot, a sprung release, a pelvis
   solver of its own — and was measured worse on a staircase than the pass it
   was taken from. Change it the way notapain would, or measure that a change is
   better before it lands. */

export type LegBones = {
  readonly foot: Object3D
  readonly knee: Object3D
  readonly restFoot: Quaternion
  readonly thigh: Object3D
  readonly toe: Object3D
}

export type SoleHeights = {
  readonly ankle: number
  readonly toe: number
}

export type LegState = {
  contact: number
  correction: number
  hold: number
  planted: boolean
  plantX: number
  plantZ: number
}

export type GroundHit = {
  readonly normal: Vector3
  readonly surfaceY: number
}

export type FootStep = {
  readonly contact: number
  readonly ground: GroundHit | null
  readonly surfaceDelta: number
  readonly target: Vector3
}

export const CORRECTION_RATE = 10
export const CONTACT_RATE = 16
export const HIP_DROP_RATE = 7
export const PLANT_MARGIN = 0.05
export const SWING_MARGIN = 0.22
export const MAX_STEP_DROP = 0.55
export const MAX_HOLD = 0.9
export const PLANT_BLEND_RATE = 9
export const PULL_STEPS = 6
export const MAX_FRAME_SECONDS = 0.1

const UP = new Vector3(0, 1, 0)

const scratch = {
  foot: new Vector3(),
  footWorld: new Quaternion(),
  hip: new Vector3(),
  knee: new Vector3(),
  parentScale: new Vector3(),
  parentWorld: new Quaternion(),
  tip: new Vector3(),
}

export type FootStepInput = {
  readonly ankleHeight: number
  readonly sole: SoleHeights
  readonly bodyForward: Vector3
  readonly bodyPosition: readonly [number, number, number]
  readonly deltaSeconds: number
  readonly groundReference: number
  readonly leg: LegBones
  readonly stance: boolean
  readonly state: LegState
  readonly strideScale: number
  readonly trace: TraceBox
}

function lerpRate(current: number, wanted: number, rate: number, deltaSeconds: number): number {
  return current + (wanted - current) * Math.min(1, Math.max(0, rate * deltaSeconds))
}

function moveToward(current: number, wanted: number, step: number): number {
  if (Math.abs(wanted - current) <= step) return wanted
  return current + Math.sign(wanted - current) * step
}

function hitOf(sample: GroundSample | null): GroundHit | null {
  if (!sample) return null
  return { normal: new Vector3(sample.normal[0], sample.normal[1], sample.normal[2]), surfaceY: sample.surfaceY }
}

function groundRay(point: Vector3, trace: TraceBox): GroundHit | null {
  return hitOf(groundUnder([point.x, point.y, point.z], trace))
}

/* @important _pull_to_ground: a stance foot with no ground within a step below
   it is past an edge, so the probe walks in toward the body in six steps and
   takes the first ground within reach — the foot plants on the edge instead of
   floating off it, and the body is not dropped off a cliff to reach it. */
function pullToGround(input: FootStepInput): { hit: GroundHit; x: number; z: number } | null {
  const { bodyPosition, trace } = input
  for (let step = 1; step <= PULL_STEPS; step += 1) {
    const share = step / PULL_STEPS
    const x = scratch.foot.x + (bodyPosition[0] - scratch.foot.x) * share
    const z = scratch.foot.z + (bodyPosition[2] - scratch.foot.z) * share
    const hit = groundRay(new Vector3(x, scratch.foot.y, z), trace)
    if (hit && scratch.foot.y - hit.surfaceY <= MAX_STEP_DROP) return { hit, x, z }
  }
  return null
}

function groundForFoot(input: FootStepInput): GroundHit | null {
  const hit = groundRay(scratch.foot, input.trace)
  if (!input.stance) return hit
  const tooFar = hit !== null && scratch.foot.y - hit.surfaceY > MAX_STEP_DROP
  if (hit !== null && !tooFar) return hit
  const pulled = pullToGround(input)
  if (!pulled) return hit
  scratch.foot.setX(pulled.x).setZ(pulled.z)
  return pulled.hit
}

function contactOf(input: FootStepInput, ground: GroundHit | null): number {
  if (!ground) return 0
  const gap = scratch.foot.y - ground.surfaceY
  if (input.stance) return 1 - smoothStep(MAX_STEP_DROP, MAX_STEP_DROP + 0.3, Math.max(gap - input.ankleHeight, 0))
  return 1 - smoothStep(input.ankleHeight + PLANT_MARGIN, input.ankleHeight + SWING_MARGIN, gap)
}

/* @important Planting by stance phase, as notapain does it: the world XZ is
   locked on the rising edge of the stance window — here, never a stale point —
   and the hold fades as the body carries the animated foot away from the lock,
   so the foot eases back onto the clip instead of snapping. */
function plantByStance(input: FootStepInput, target: Vector3, deltaSeconds: number): void {
  const { stance, state } = input
  const was = state.planted
  state.planted = stance
  if (state.planted && !was) {
    state.plantX = target.x
    state.plantZ = target.z
  }
  const gap = Math.hypot(scratch.foot.x - state.plantX, scratch.foot.z - state.plantZ)
  const wanted = (state.planted ? 1 : 0) * (1 - smoothStep(MAX_HOLD * 0.5, MAX_HOLD, gap))
  state.hold = moveToward(state.hold, wanted, PLANT_BLEND_RATE * deltaSeconds)
  target.setX(target.x + (state.plantX - target.x) * state.hold)
  target.setZ(target.z + (state.plantZ - target.z) * state.hold)
}

export function stepFoot(input: FootStepInput): FootStep {
  const { bodyForward, groundReference, leg, state, strideScale } = input
  const deltaSeconds = Math.min(Math.max(input.deltaSeconds, 0), MAX_FRAME_SECONDS)
  leg.foot.getWorldPosition(scratch.foot)
  leg.thigh.getWorldPosition(scratch.hip)
  const ground = groundForFoot(input)

  const surfaceDelta = ground ? ground.surfaceY - groundReference : 0
  state.contact = lerpRate(state.contact, contactOf(input, ground), CONTACT_RATE, deltaSeconds)
  state.correction = lerpRate(state.correction, surfaceDelta * state.contact, CORRECTION_RATE, deltaSeconds)

  const target = new Vector3(scratch.foot.x, scratch.foot.y + state.correction, scratch.foot.z)
  if (Math.abs(strideScale - 1) > 0.01) {
    const fore = target.clone().sub(scratch.hip).dot(bodyForward)
    target.addScaledVector(bodyForward, fore * (strideScale - 1))
  }
  plantByStance(input, target, deltaSeconds)
  pushOutOfGround(input, target)
  return { contact: state.contact, ground, surfaceDelta, target }
}

/* @important Unreal's FinalizeFootAlignment: once the foot has its target, it is
   pushed straight up out of the ground under it — the ankle and the ball both
   checked, each against the surface beneath it, the lower one deciding — and
   nothing else moves. The body stays where it stands; only the pose of the foot
   changes. As much penetration as the clip itself had is allowed, so a toe the
   animation deliberately rolls into the floor is not fought. */
function pushOutOfGround(input: FootStepInput, target: Vector3): void {
  const { leg, sole, trace } = input
  leg.toe.getWorldPosition(scratch.tip)
  const toeOffset = scratch.tip.clone().sub(scratch.foot)
  const toeTarget = target.clone().add(toeOffset)
  const underAnkle = groundRay(target, trace)
  const underToe = groundRay(toeTarget, trace)
  const distances: number[] = []
  if (underAnkle) distances.push(target.y - sole.ankle - underAnkle.surfaceY)
  if (underToe) distances.push(toeTarget.y - sole.toe - underToe.surfaceY)
  if (distances.length === 0) return
  const allowed = Math.min(0, scratch.foot.y - sole.ankle - (underAnkle ? underAnkle.surfaceY : scratch.foot.y))
  const lowest = Math.min(...distances) - allowed
  if (lowest < 0) target.setY(target.y - lowest)
}

export function writeLeg(leg: LegBones, target: Vector3, chain: TwoBoneChain, bodyForward: Vector3): void {
  leg.thigh.getWorldPosition(scratch.hip)
  leg.knee.getWorldPosition(scratch.knee)
  const solved = solveTwoBoneIk(scratch.hip, scratch.knee, target, chain, bodyForward)

  aimBoneAlong(leg.thigh, scratch.knee.clone().sub(scratch.hip), solved.mid.clone().sub(scratch.hip))
  leg.thigh.updateMatrixWorld(true)
  leg.knee.getWorldPosition(scratch.knee)
  leg.foot.getWorldPosition(scratch.tip)
  aimBoneAlong(leg.knee, scratch.tip.clone().sub(scratch.knee), solved.tip.clone().sub(scratch.knee))
  leg.knee.updateMatrixWorld(true)
}

/* @important notapain's FootRotate: the sole is turned onto the ground normal,
   weighted by contact — on level ground too, which is how a foot the clip left
   pitched ends up flat under a standing body. */
export function levelFootToGround(leg: LegBones, normal: Vector3, contact: number): void {
  const parent = leg.foot.parent
  if (contact < 0.01 || !parent) return
  const world = leg.foot.getWorldQuaternion(scratch.footWorld)
  const levelled = levelledFoot(world, leg.restFoot, normal.lengthSq() > 0 ? normal : UP, contact)
  const inverseParent = parent.getWorldQuaternion(scratch.parentWorld).invert()
  leg.foot.quaternion.copy(inverseParent.multiply(levelled))
  leg.foot.updateMatrixWorld(true)
}

export function dropPelvis(hips: Object3D, rig: Object3D, drop: number): void {
  if (Math.abs(drop) <= 0.001 || !hips.parent) return
  hips.parent.getWorldQuaternion(scratch.parentWorld)
  hips.parent.getWorldScale(scratch.parentScale)
  hips.position.add(localDropOffset(scratch.parentWorld, scratch.parentScale, drop))
  rig.updateMatrixWorld(true)
}

/* @important The pelvis drops by the deepest planted-foot drop, so the low foot
   is reachable without hyper-extending the leg, and by nothing on flat ground. */
export function nextHipDrop(current: number, steps: readonly FootStep[], deltaSeconds: number): number {
  const deepest = steps.reduce((lowest, step) => Math.min(lowest, Math.min(0, step.surfaceDelta) * step.contact), 0)
  const wanted = Math.min(Math.max(-deepest, 0), MAX_STEP_DROP)
  const eased = lerpRate(current, wanted, HIP_DROP_RATE, Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_SECONDS))
  return Math.min(Math.max(eased, -MAX_STEP_DROP), MAX_STEP_DROP)
}
