import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { Vector3 } from 'three'
import type { Object3D } from 'three'

import { pelvisForward, type TwoBoneChain } from '../../../shared/lib/animation/twoBoneIk'
import { LOCOMOTION_STANCE_WINDOWS, RUN_STANCE_WINDOWS } from '../catalog/locomotionClips'
import type { TraceBox } from '../systems/boxTrace'
import { groundUnder } from '../systems/footGround'
import type { LocomotionClipId } from '../systems/locomotionPose'
import { yawForward } from '../systems/motionIntent'
import { crossingRelease, mutualSeparation, RESTING_SEPARATION, springSeparation, type FeetPair } from '../systems/footSeparation'
import { followSupport, supportHeight, teleported } from '../systems/supportHeight'
import { footStance } from '../systems/stanceWindow'
import { strideScaleFor } from '../systems/strideWarp'
import {
  dropPelvis,
  nextHipDrop,
  pushOutOfGround,
  stepFoot,
  tiltFootToGround,
  writeLeg,
  type FootStep,
  type LegBones,
  type LegState,
  type SoleHeights,
} from './footPlacementPass'
import type { MotionTimeline } from './useMotionController'

export type GaitReading = {
  readonly blendShare: number
  readonly clipId: LocomotionClipId
  readonly clipSpeed: number
  readonly grounded: boolean
  readonly phase: number
  readonly stride: number
}

export type FootPlacementOptions = {
  readonly ankleHeight?: number
  readonly enabled?: () => boolean
  readonly gait: () => GaitReading
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly trace: TraceBox
}

export type LimbReading = {
  readonly ankleHeight: number
  readonly bendForward: number
  readonly bendSideways: number
  readonly contact: number
  readonly foot: readonly [number, number, number]
  readonly groundGap: number
  readonly hip: readonly [number, number, number]
  readonly hold: number
  readonly knee: readonly [number, number, number]
  readonly animated: readonly [number, number, number]
  readonly lock: readonly [number, number]
  readonly plantYaw: number
  readonly floorHeight: number | null
  readonly released: boolean
  readonly separation: readonly [number, number]
  readonly lowestGap: number
  readonly target: readonly [number, number, number] | null
  readonly toe: readonly [number, number, number]
  readonly lowerLength: number
  readonly surfaceY: number | null
  readonly upperLength: number
}

export type FootPlacementDebug = {
  readonly characterFloor: number
  readonly colliderFloor: number
  readonly contact: readonly [number, number]
  readonly support: number | null
  readonly enabled: boolean
  readonly facingRadians: number
  readonly limbs: readonly LimbReading[]
  readonly locked: readonly [boolean, boolean]
  readonly pelvisDrop: number
  readonly strideScale: number
  readonly surfaceDelta: readonly [number, number]
}

const MOVING_SPEED = 0.05

function boneNamed(rig: Object3D, pattern: RegExp): Object3D {
  let found: Object3D | null = null
  rig.traverse((node) => {
    if (!found && pattern.test(node.name)) found = node
  })
  if (!found) throw new Error(`rig has no bone matching ${pattern.source}`)
  return found
}

function legOf(rig: Object3D, side: 'Left' | 'Right'): LegBones {
  const foot = boneNamed(rig, new RegExp(`${side}Foot$`))
  return {
    foot,
    knee: boneNamed(rig, new RegExp(`${side}Leg$`)),
    thigh: boneNamed(rig, new RegExp(`${side}UpLeg$`)),
    toe: boneNamed(rig, new RegExp(`${side}ToeBase$`)),
  }
}

function chainOf(leg: LegBones): TwoBoneChain {
  const hip = leg.thigh.getWorldPosition(new Vector3())
  const knee = leg.knee.getWorldPosition(new Vector3())
  const foot = leg.foot.getWorldPosition(new Vector3())
  return { lowerLength: knee.distanceTo(foot), upperLength: hip.distanceTo(knee) }
}

/* @important Mutual foot placement. Unreal keeps a swing foot off a plane at
   the midpoint of the animated feet (SeparatingDistance); that plane cannot see
   a planted foot the body has walked away from, and a swing foot kept on its
   own side of it still walks into that foot. So the gap is measured between
   where the two feet are actually going, across the line of the hip joints,
   and the feet free to move are sprung apart by Unreal's floor spring until it
   is as wide as the clip had it. A foot still locked where the body has carried
   it in under the other leg is let go, and Unreal's unplant eases it back. */
function separateFeet(legs: readonly LegBones[], steps: readonly FootStep[], states: LegState[], deltaSeconds: number): void {
  const left = legs[0].thigh.getWorldPosition(new Vector3())
  const right = legs[1].thigh.getWorldPosition(new Vector3())
  const feet: FeetPair = {
    animated: [[steps[0].animated.x, steps[0].animated.z], [steps[1].animated.x, steps[1].animated.z]],
    holds: [states[0].hold, states[1].hold],
    side: [left.x - right.x, left.z - right.z],
    solved: [[steps[0].target.x, steps[0].target.z], [steps[1].target.x, steps[1].target.z]],
  }
  const wanted = mutualSeparation(feet)
  const release = crossingRelease(feet)
  steps.forEach((step, index) => {
    if (release[index]) states[index].released = true
    states[index].separation = springSeparation(states[index].separation, wanted[index], deltaSeconds)
    step.target.setX(step.target.x + states[index].separation.offset[0])
    step.target.setZ(step.target.z + states[index].separation.offset[1])
  })
}

/* @important The bend of the knee is reported in the BODY's frame, not the
   world's: where the knee sits relative to the hip-to-ankle line, split into
   how far forward and how far sideways. A defect that turns the knee inward
   leaves every world position, bone length and joint angle perfectly legal, so
   nothing else here can see it. Sideways is signed outward for each leg. */
function bendOf(hip: Vector3, knee: Vector3, foot: Vector3, facingRadians: number, side: number) {
  const axis = foot.clone().sub(hip)
  const along = axis.lengthSq() > 1e-9 ? axis.clone().normalize() : new Vector3(0, -1, 0)
  const offset = knee.clone().sub(hip)
  offset.addScaledVector(along, -offset.dot(along))
  const forward = new Vector3(Math.sin(facingRadians), 0, Math.cos(facingRadians))
  const outward = new Vector3(-Math.cos(facingRadians), 0, Math.sin(facingRadians)).multiplyScalar(side)
  return { bendForward: offset.dot(forward), bendSideways: offset.dot(outward) }
}

/* @important Each point of the foot is measured against the ground under THAT
   point. Measuring the toe against the tread under the ankle is wrong exactly
   where it matters — at a nosing, where the ankle is over one step and the ball
   of the foot over the next — and it read a toe standing properly on the lower
   step as half a metre in the air. */
function lowestGapOf(foot: Vector3, toe: Vector3, ankle: number, trace: TraceBox): number {
  const underAnkle = groundUnder([foot.x, foot.y, foot.z], trace)
  const underToe = groundUnder([toe.x, toe.y, toe.z], trace)
  const gaps: number[] = []
  if (underAnkle) gaps.push(foot.y - ankle - underAnkle.surfaceY)
  if (underToe) gaps.push(toe.y - underToe.surfaceY)
  return gaps.length > 0 ? Math.min(...gaps) : Number.POSITIVE_INFINITY
}

function limbReading(
  trace: TraceBox,
  ankle: number,
  leg: LegBones,
  chain: TwoBoneChain,
  step: {
    readonly animated: Vector3
    readonly contact: number
    readonly ground: { readonly surfaceY: number } | null
    readonly target?: Vector3
  },
  state: LegState,
  facingRadians: number,
  side: number,
): LimbReading {
  const hip = leg.thigh.getWorldPosition(new Vector3())
  const knee = leg.knee.getWorldPosition(new Vector3())
  const foot = leg.foot.getWorldPosition(new Vector3())
  const toeBone = leg.foot.children.find((child) => /Toe/.test(child.name)) ?? leg.foot
  const toe = toeBone.getWorldPosition(new Vector3())
  return {
    ankleHeight: ankle,
    ...bendOf(hip, knee, foot, facingRadians, side),
    contact: step.contact,
    foot: [foot.x, foot.y, foot.z],
    groundGap: step.ground ? foot.y - step.ground.surfaceY : Number.POSITIVE_INFINITY,
    hip: [hip.x, hip.y, hip.z],
    hold: state.hold,
    knee: [knee.x, knee.y, knee.z],
    animated: [step.animated.x, step.animated.y, step.animated.z],
    lock: [state.plantX, state.plantZ],
    plantYaw: state.plantYaw,
    floorHeight: state.floor ? state.floor.height : null,
    released: state.released,
    separation: [state.separation.offset[0], state.separation.offset[1]],
    lowestGap: lowestGapOf(foot, toe, ankle, trace),
    target: step.target ? [step.target.x, step.target.y, step.target.z] : null,
    toe: [toe.x, toe.y, toe.z],
    lowerLength: chain.lowerLength,
    surfaceY: step.ground ? step.ground.surfaceY : null,
    upperLength: chain.upperLength,
  }
}

/* @important The rig's rest height is kept on the rig itself, the first time
   anything asks for it. This pass moves the rig up and down every frame to
   stand the character on its feet, so reading rig.position.y a second time —
   which a hot reload or a re-render does — captured an already-shifted height
   and left the character running a few centimetres in the air for good. */
function restHeightOf(rig: Object3D): number {
  const data = rig.userData as { standRestY?: number }
  if (data.standRestY === undefined) data.standRestY = rig.position.y
  return data.standRestY
}

function freshState(): LegState {
  return { contact: 0, correction: 0, hold: 0, planted: false, floor: null, lastToe: null, plantX: 0, plantYaw: 0, plantZ: 0, released: false, separation: RESTING_SEPARATION }
}

/* @important The ankle height is measured from the rig, the way notapain
   measures it: how far the ankle bone sits above the toe bone in the bind pose,
   which stands on the floor. A constant typed in by hand was 0.09 against a
   measured 0.123 on this mannequin, and every contact threshold inherited the
   error. */
/* @important How high the ankle and the ball of the foot sit above the sole,
   read from the bind pose — which stands on the rig's own floor — rather than
   typed in. Pushing a foot out of the ground needs to know where its sole is,
   and a guessed constant was 3 cm off on this mannequin. */
function soleHeightsOf(legs: readonly LegBones[], rig: Object3D): SoleHeights {
  rig.updateMatrixWorld(true)
  const floor = rig.getWorldPosition(new Vector3()).y
  const average = (pick: (leg: LegBones) => Object3D) => legs
    .map((leg) => pick(leg).getWorldPosition(new Vector3()).y - floor)
    .reduce((sum, height) => sum + height, 0) / legs.length
  return { ankle: average((leg) => leg.foot), toe: average((leg) => leg.toe) }
}

function ankleHeightOf(legs: readonly LegBones[], rig: Object3D): number {
  const heights = legs.map((leg) => {
    const toe = leg.foot.children.find((child) => /Toe/.test(child.name))
    if (!toe) return 0.09
    rig.updateMatrixWorld(true)
    return Math.abs(leg.foot.getWorldPosition(new Vector3()).y - toe.getWorldPosition(new Vector3()).y)
  })
  return heights.reduce((sum, height) => sum + height, 0) / heights.length
}

type FootRig = {
  readonly ankleHeight: number
  readonly chains: readonly TwoBoneChain[]
  readonly hips: Object3D
  readonly legs: readonly LegBones[]
  readonly rig: Object3D
  readonly rigRestY: number
  readonly sole: SoleHeights
  readonly trace: TraceBox
}

type FootMemory = {
  lastCollider: readonly [number, number, number] | null
  lastElapsed: number | null
  lastSupport: number | null
  pelvisDrop: number
  standingOn: number | null
  readonly states: LegState[]
}

type BodyReading = MotionTimeline['current']

type LimbStep = Parameters<typeof limbReading>[4]

const STILL_DEBUG: FootPlacementDebug = {
  characterFloor: 0,
  colliderFloor: 0,
  contact: [0, 0],
  enabled: true,
  facingRadians: 0,
  limbs: [],
  locked: [false, false],
  pelvisDrop: 0,
  strideScale: 1,
  support: null,
  surfaceDelta: [0, 0],
}

function readingsOf(feet: FootRig, memory: FootMemory, steps: readonly LimbStep[], facingRadians: number): LimbReading[] {
  return feet.legs.map((leg, index) => limbReading(
    feet.trace,
    feet.ankleHeight,
    leg,
    feet.chains[index],
    steps[index],
    memory.states[index],
    facingRadians,
    index === 0 ? 1 : -1,
  ))
}

function disabledDebug(feet: FootRig, memory: FootMemory, body: BodyReading): FootPlacementDebug {
  const steps = feet.legs.map((leg) => ({ animated: leg.foot.getWorldPosition(new Vector3()), contact: 0, ground: null }))
  return { ...STILL_DEBUG, enabled: false, facingRadians: body.bodyFacingRadians, limbs: readingsOf(feet, memory, steps, body.bodyFacingRadians) }
}

function stanceOf(reading: GaitReading) {
  const windows = LOCOMOTION_STANCE_WINDOWS[reading.clipId] ?? LOCOMOTION_STANCE_WINDOWS['walk-forward']
  return footStance({
    blendShare: reading.blendShare,
    grounded: reading.grounded,
    phase: reading.phase,
    runWindows: reading.clipId.startsWith('run') ? windows : RUN_STANCE_WINDOWS,
    walkWindows: windows,
  })
}

/* @important A warp leaves everything the legs remembered about where they
   stood behind: locks, supports, floors, the pelvis drop. */
function forgetPlace(memory: FootMemory): void {
  memory.lastSupport = null
  memory.pelvisDrop = 0
  memory.states.splice(0, memory.states.length, ...memory.states.map(freshState))
}

/* @important The character is primary and the collider secondary: the drawn
   body stands on the ground its lowest planted foot finally rests on, carried
   between supports by Unreal's damper, and the collider only bounds how far
   the two may drift apart. The collider climbs a step as soon as its front
   edge is over it; the character rises when its trailing foot lifts off the
   lower tread, which is when a person does. */
function standCharacter(feet: FootRig, memory: FootMemory, deltaSeconds: number) {
  const collider = feet.rig.parent ? feet.rig.parent.getWorldPosition(new Vector3()) : new Vector3()
  const colliderFloor = collider.y + feet.rigRestY
  const warped = teleported(memory.lastCollider, [collider.x, collider.y, collider.z])
  memory.lastCollider = [collider.x, collider.y, collider.z]
  if (warped) forgetPlace(memory)
  memory.standingOn = memory.standingOn === null || warped
    ? colliderFloor
    : followSupport(memory.standingOn, memory.lastSupport ?? colliderFloor, colliderFloor, deltaSeconds)
  const characterFloor = memory.standingOn
  feet.rig.position.y = feet.rigRestY + (characterFloor - colliderFloor)
  feet.rig.updateMatrixWorld(true)
  return { characterFloor, colliderFloor }
}

function settlePelvis(
  feet: FootRig,
  memory: FootMemory,
  steps: readonly FootStep[],
  resting: readonly (number | null)[],
  deltaSeconds: number,
): void {
  const reference = memory.standingOn ?? 0
  const restingSteps = steps.map((step, index) => {
    const groundY = resting[index]
    return groundY === null ? step : { ...step, surfaceDelta: groundY - reference }
  })
  memory.pelvisDrop = nextHipDrop(memory.pelvisDrop, restingSteps, deltaSeconds)
  dropPelvis(feet.hips, feet.rig, memory.pelvisDrop)
}

function strideScaleOf(body: BodyReading, reading: GaitReading): number {
  const speed = Math.hypot(body.velocity[0], body.velocity[2])
  return speed > MOVING_SPEED ? strideScaleFor(speed, reading.clipSpeed * Math.max(0.1, reading.stride)) : 1
}

function placeFeet(feet: FootRig, memory: FootMemory, body: BodyReading, reading: GaitReading, deltaSeconds: number): FootPlacementDebug {
  const stance = stanceOf(reading)
  const facing = yawForward(body.bodyFacingRadians)
  const forward = new Vector3(facing.x, 0, facing.z)
  const strideScale = strideScaleOf(body, reading)
  const { characterFloor, colliderFloor } = standCharacter(feet, memory, deltaSeconds)

  const inputs = feet.legs.map((leg, index) => ({
    ankleHeight: feet.ankleHeight,
    bodyForward: forward,
    bodyPosition: body.position,
    deltaSeconds,
    groundReference: characterFloor,
    leg,
    sole: feet.sole,
    stance: index === 0 ? stance.left : stance.right,
    state: memory.states[index],
    strideScale,
    trace: feet.trace,
  }))
  const steps = inputs.map(stepFoot)
  separateFeet(feet.legs, steps, memory.states, deltaSeconds)
  const resting = steps.map((step, index) => pushOutOfGround(inputs[index], step.target))
  memory.lastSupport = supportHeight(
    resting.map((groundY, index) => ({ groundY, hold: memory.states[index].hold })),
    colliderFloor,
    memory.lastSupport,
  )
  settlePelvis(feet, memory, steps, resting, deltaSeconds)

  const legForward = pelvisForward(feet.legs[0].thigh.getWorldPosition(new Vector3()), feet.legs[1].thigh.getWorldPosition(new Vector3()), forward)
  steps.forEach((step, index) => {
    writeLeg(feet.legs[index], step.target, feet.chains[index], legForward)
    if (step.ground) tiltFootToGround(feet.legs[index], step.ground.normal, step.contact)
  })

  const held = (state: LegState) => state.planted && state.hold > 0.01
  return {
    characterFloor,
    colliderFloor,
    contact: [steps[0].contact, steps[1].contact],
    enabled: true,
    facingRadians: body.bodyFacingRadians,
    limbs: readingsOf(feet, memory, steps, body.bodyFacingRadians),
    locked: [held(memory.states[0]), held(memory.states[1])],
    pelvisDrop: memory.pelvisDrop,
    strideScale,
    support: memory.lastSupport,
    surfaceDelta: [steps[0].surfaceDelta, steps[1].surfaceDelta],
  }
}

function footRigOf(rig: Object3D, trace: TraceBox, ankleHeight: number | undefined): FootRig {
  const legs = [legOf(rig, 'Left'), legOf(rig, 'Right')]
  return {
    ankleHeight: ankleHeight ?? ankleHeightOf(legs, rig),
    chains: legs.map(chainOf),
    hips: boneNamed(rig, /Hips$/),
    legs,
    rig,
    rigRestY: restHeightOf(rig),
    sole: soleHeightsOf(legs, rig),
    trace,
  }
}

export function useFootPlacement(options: FootPlacementOptions): MutableRefObject<FootPlacementDebug> {
  const { ankleHeight, enabled, gait, rig, timeline, trace } = options
  const feet = useMemo(() => footRigOf(rig, trace, ankleHeight), [ankleHeight, rig, trace])
  const memory = useRef<FootMemory>({
    lastCollider: null,
    lastElapsed: null,
    lastSupport: null,
    pelvisDrop: 0,
    standingOn: null,
    states: [freshState(), freshState()],
  })
  const debug = useRef<FootPlacementDebug>(STILL_DEBUG)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const target = window as Window & { __motionFeet?: () => FootPlacementDebug }
    target.__motionFeet = () => debug.current
    return () => {
      delete target.__motionFeet
    }
  }, [])

  /* @important The pass ages on the SIMULATION clock: the time the body has
     lived since the last frame this pass ran, not the render delta. Rendered
     faster than the tick, a frame that saw no tick smooths nothing; on the
     stepping bench, one click is one sixtieth of a second of smoothing rather
     than the tenth of a second the render took. */
  useFrame(() => {
    const body = timeline.current.current
    const state = memory.current
    const delta = state.lastElapsed === null ? 0 : Math.max(0, body.elapsedSeconds - state.lastElapsed)
    state.lastElapsed = body.elapsedSeconds
    debug.current = enabled && !enabled()
      ? disabledDebug(feet, state, body)
      : placeFeet(feet, state, body, gait(), delta)
  })

  return debug
}
