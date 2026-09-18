import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import type { TwoBoneChain } from '../../../shared/lib/animation/twoBoneIk'
import { LOCOMOTION_STANCE_WINDOWS, RUN_STANCE_WINDOWS } from '../catalog/locomotionClips'
import type { TraceBox } from '../systems/boxTrace'
import type { LocomotionClipId } from '../systems/locomotionPose'
import { approachWeight, NO_PLANT } from '../systems/footPlanting'
import { yawForward } from '../systems/motionIntent'
import { footStance } from '../systems/stanceWindow'
import { limbOffsetRange, pelvisOffset } from '../systems/pelvisSolve'
import { strideScaleFor } from '../systems/strideWarp'
import {
  dropPelvis,
  levelFootToGround,
  stepFoot,
  writeLeg,
  type FootPlacementTuning,
  type LegBones,
  type LegState,
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
  readonly lock: readonly [number, number]
  readonly lowerLength: number
  readonly surfaceY: number | null
  readonly upperLength: number
}

export type FootPlacementDebug = {
  readonly contact: readonly [number, number]
  readonly enabled: boolean
  readonly facingRadians: number
  readonly limbs: readonly LimbReading[]
  readonly locked: readonly [boolean, boolean]
  readonly pelvisDrop: number
  readonly strideScale: number
  readonly surfaceDelta: readonly [number, number]
}

const PELVIS_RATE = 7
const MOVING_SPEED = 0.05
const BODY_GROUND_OFFSET = 0.9

function boneNamed(rig: Object3D, pattern: RegExp): Object3D {
  let found: Object3D | null = null
  rig.traverse((node) => {
    if (!found && pattern.test(node.name)) found = node
  })
  if (!found) throw new Error(`rig has no bone matching ${pattern.source}`)
  return found
}

/* @important The rest orientation of the foot is captured before any clip has
   been played, because it is the definition of a flat sole on this rig: the
   bind pose stands on the ground. A frame later the mixer has overwritten it. */
function legOf(rig: Object3D, side: 'Left' | 'Right'): LegBones {
  const foot = boneNamed(rig, new RegExp(`${side}Foot$`))
  return {
    foot,
    knee: boneNamed(rig, new RegExp(`${side}Leg$`)),
    restFoot: foot.getWorldQuaternion(new Quaternion()),
    thigh: boneNamed(rig, new RegExp(`${side}UpLeg$`)),
  }
}

function chainOf(leg: LegBones): TwoBoneChain {
  const hip = leg.thigh.getWorldPosition(new Vector3())
  const knee = leg.knee.getWorldPosition(new Vector3())
  const foot = leg.foot.getWorldPosition(new Vector3())
  return { lowerLength: knee.distanceTo(foot), upperLength: hip.distanceTo(knee) }
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

function limbReading(
  ankle: number,
  leg: LegBones,
  chain: TwoBoneChain,
  step: { readonly contact: number; readonly ground: { readonly surfaceY: number } | null },
  state: LegState,
  facingRadians: number,
  side: number,
): LimbReading {
  const hip = leg.thigh.getWorldPosition(new Vector3())
  const knee = leg.knee.getWorldPosition(new Vector3())
  const foot = leg.foot.getWorldPosition(new Vector3())
  return {
    ankleHeight: ankle,
    ...bendOf(hip, knee, foot, facingRadians, side),
    contact: step.contact,
    foot: [foot.x, foot.y, foot.z],
    groundGap: step.ground ? foot.y - step.ground.surfaceY : Number.POSITIVE_INFINITY,
    hip: [hip.x, hip.y, hip.z],
    hold: state.hold,
    knee: [knee.x, knee.y, knee.z],
    lock: [state.plant.lockX, state.plant.lockZ],
    lowerLength: chain.lowerLength,
    surfaceY: step.ground ? step.ground.surfaceY : null,
    upperLength: chain.upperLength,
  }
}

function freshState(): LegState {
  return {
    contact: 0,
    correction: 0,
    footSpeed: 0,
    hold: 0,
    lockFacing: 0,
    plant: NO_PLANT,
    previousFoot: null,
    releasing: false,
    wasStance: false,
  }
}

export function useFootPlacement(options: FootPlacementOptions): MutableRefObject<FootPlacementDebug> {
  const { ankleHeight = 0.09, enabled, gait, rig, timeline, trace } = options
  const legs = useMemo(() => [legOf(rig, 'Left'), legOf(rig, 'Right')], [rig])
  const hips = useMemo(() => boneNamed(rig, /Hips$/), [rig])
  const chains = useMemo(() => legs.map(chainOf), [legs])
  const tuning = useMemo<FootPlacementTuning>(
    () => ({ ankleHeight, contactRate: 16, correctionRate: 10, maxStepDrop: 0.55 }),
    [ankleHeight],
  )
  const states = useRef<LegState[]>([freshState(), freshState()])
  const lastTravelled = useRef(0)
  const pelvisDrop = useRef(0)
  const forward = useMemo(() => new Vector3(0, 0, 1), [])
  const debug = useRef<FootPlacementDebug>({
    contact: [0, 0],
    enabled: true,
    facingRadians: 0,
    limbs: [],
    locked: [false, false],
    pelvisDrop: 0,
    strideScale: 1,
    surfaceDelta: [0, 0],
  })

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const target = window as Window & { __motionFeet?: () => FootPlacementDebug }
    target.__motionFeet = () => debug.current
    return () => {
      delete target.__motionFeet
    }
  }, [])

  useFrame((_, delta) => {
    const body = timeline.current.current
    if (enabled && !enabled()) {
      debug.current = {
        contact: [0, 0],
        enabled: false,
        facingRadians: body.bodyFacingRadians,
        limbs: legs.map((leg, index) => limbReading(
          ankleHeight,
          leg,
          chains[index],
          { contact: 0, ground: null },
          states.current[index],
          body.bodyFacingRadians,
          index === 0 ? 1 : -1,
        )),
        locked: [false, false],
        pelvisDrop: 0,
        strideScale: 1,
        surfaceDelta: [0, 0],
      }
      return
    }
    const reading = gait()
    const windows = LOCOMOTION_STANCE_WINDOWS[reading.clipId] ?? LOCOMOTION_STANCE_WINDOWS['walk-forward']
    const stance = footStance({
      blendShare: reading.blendShare,
      grounded: reading.grounded,
      phase: reading.phase,
      runWindows: reading.clipId.startsWith('run') ? windows : RUN_STANCE_WINDOWS,
      walkWindows: windows,
    })
    const speed = Math.hypot(body.velocity[0], body.velocity[2])
    const facing = yawForward(body.bodyFacingRadians)
    forward.set(facing.x, 0, facing.z)
    const strideScale = speed > MOVING_SPEED
      ? strideScaleFor(speed, reading.clipSpeed * Math.max(0.1, reading.stride))
      : 1

    const travelDelta = Math.max(0, body.travelledMeters - lastTravelled.current)
    lastTravelled.current = body.travelledMeters
    const steps = legs.map((leg, index) => stepFoot({
      bodyForward: forward,
      bodyPosition: [body.position[0], body.position[2]],
      bodySpeed: speed,
      chain: chains[index],
      facingRadians: body.bodyFacingRadians,
      deltaSeconds: delta,
      groundReference: body.position[1] - BODY_GROUND_OFFSET,
      leg,
      stance: index === 0 ? stance.left : stance.right,
      standing: stance.standing,
      state: states.current[index],
      strideScale,
      trace,
      travelDelta,
      tuning,
    }))

    /* @important The pelvis follows the feet through Unreal's own solver rather
       than through the deepest drop it can find: each leg says how far the
       pelvis may travel for it, and the compromise between those ranges is what
       moves. Taking the deepest demand instead fed the drop its own result back
       and folded a standing character 41 cm into the floor. */
    const offset = pelvisOffset(steps.map((step) => limbOffsetRange(step.reach)))
    pelvisDrop.current = approachWeight(pelvisDrop.current, Math.max(0, -offset), PELVIS_RATE, delta)
    dropPelvis(hips, rig, pelvisDrop.current)

    steps.forEach((step, index) => {
      if (step.contact < 0.01) return
      writeLeg(legs[index], step.target, chains[index], forward)
      if (step.ground) levelFootToGround(legs[index], step.ground.normal, step.contact, stance.standing)
    })

    debug.current = {
      contact: [steps[0].contact, steps[1].contact],
      enabled: true,
      facingRadians: body.bodyFacingRadians,
      limbs: legs.map((leg, index) => limbReading(
        ankleHeight,
        leg,
        chains[index],
        steps[index],
        states.current[index],
        body.bodyFacingRadians,
        index === 0 ? 1 : -1,
      )),
      locked: [states.current[0].plant.locked, states.current[1].plant.locked],
      pelvisDrop: pelvisDrop.current,
      strideScale,
      surfaceDelta: [steps[0].surfaceDelta, steps[1].surfaceDelta],
    }
  })

  return debug
}
