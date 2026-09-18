import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import type { TwoBoneChain } from '../../../shared/lib/animation/twoBoneIk'
import { LOCOMOTION_STANCE_WINDOWS, RUN_STANCE_WINDOWS } from '../catalog/locomotionClips'
import type { TraceBox } from '../systems/boxTrace'
import { groundUnder } from '../systems/footGround'
import type { LocomotionClipId } from '../systems/locomotionPose'
import { yawForward } from '../systems/motionIntent'
import { carryStep } from '../systems/pelvisOffset'
import { footStance } from '../systems/stanceWindow'
import { strideScaleFor } from '../systems/strideWarp'
import {
  dropPelvis,
  levelFootToGround,
  nextHipDrop,
  stepFoot,
  writeLeg,
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
  readonly lock: readonly [number, number]
  readonly lowestGap: number
  readonly target: readonly [number, number, number] | null
  readonly toe: readonly [number, number, number]
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

const MOVING_SPEED = 0.05

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
    toe: boneNamed(rig, new RegExp(`${side}ToeBase$`)),
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
    lock: [state.plantX, state.plantZ],
    lowestGap: lowestGapOf(foot, toe, ankle, trace),
    target: step.target ? [step.target.x, step.target.y, step.target.z] : null,
    toe: [toe.x, toe.y, toe.z],
    lowerLength: chain.lowerLength,
    surfaceY: step.ground ? step.ground.surfaceY : null,
    upperLength: chain.upperLength,
  }
}

function freshState(): LegState {
  return { contact: 0, correction: 0, hold: 0, planted: false, plantX: 0, plantZ: 0 }
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

export function useFootPlacement(options: FootPlacementOptions): MutableRefObject<FootPlacementDebug> {
  const { enabled, gait, rig, timeline, trace } = options
  const legs = useMemo(() => [legOf(rig, 'Left'), legOf(rig, 'Right')], [rig])
  const hips = useMemo(() => boneNamed(rig, /Hips$/), [rig])
  const chains = useMemo(() => legs.map(chainOf), [legs])
  const ankleHeight = useMemo(() => options.ankleHeight ?? ankleHeightOf(legs, rig), [legs, options.ankleHeight, rig])
  const sole = useMemo(() => soleHeightsOf(legs, rig), [legs, rig])
  const states = useRef<LegState[]>([freshState(), freshState()])
  const pelvisDrop = useRef(0)
  const lastCapsule = useRef<{ grounded: boolean; y: number } | null>(null)
  const lastElapsed = useRef<number | null>(null)
  const forward = useMemo(() => new Vector3(0, 0, 1), [])
  const meshFloor = useMemo(() => new Vector3(), [])
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

  /* @important The pass ages on the SIMULATION clock: the time the body has
     lived since the last frame this pass ran, not the render delta. Rendered
     faster than the tick, a frame that saw no tick smooths nothing; on the
     stepping bench, one click is one sixtieth of a second of smoothing rather
     than the tenth of a second the render took. */
  useFrame(() => {
    const body = timeline.current.current
    const delta = lastElapsed.current === null ? 0 : Math.max(0, body.elapsedSeconds - lastElapsed.current)
    lastElapsed.current = body.elapsedSeconds
    if (enabled && !enabled()) {
      debug.current = {
        contact: [0, 0],
        enabled: false,
        facingRadians: body.bodyFacingRadians,
        limbs: legs.map((leg, index) => limbReading(
          trace,
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

    /* @important Unreal's SuddenMotionOnly compensation: a vertical jump of the
       capsule that walking along the floor does not explain — a step up or down
       — is taken straight out of the pelvis offset and out of each leg's ground
       correction on the frame it happens. The pelvis therefore stays where it
       was in the world and settles back over the frames that follow, and a foot
       still standing on the lower tread keeps its height instead of rising with
       the mesh and hanging over it. */
    const grounded = body.mode === 'walking'
    const previousCapsule = lastCapsule.current
    const rise = previousCapsule && previousCapsule.grounded ? body.position[1] - previousCapsule.y : 0
    lastCapsule.current = { grounded, y: body.position[1] }
    const sudden = carryStep(0, rise, grounded)
    if (sudden !== 0) {
      pelvisDrop.current += sudden
      for (const state of states.current) state.correction -= sudden
    }

    const steps = legs.map((leg, index) => stepFoot({
      ankleHeight,
      sole,
      bodyForward: forward,
      bodyPosition: body.position,
      deltaSeconds: delta,
      groundReference: rig.getWorldPosition(meshFloor).y,
      leg,
      stance: index === 0 ? stance.left : stance.right,
      state: states.current[index],
      strideScale,
      trace,
    }))

    pelvisDrop.current = nextHipDrop(pelvisDrop.current, steps, delta)
    dropPelvis(hips, rig, pelvisDrop.current)

    steps.forEach((step, index) => {
      writeLeg(legs[index], step.target, chains[index], forward)
      if (step.ground) levelFootToGround(legs[index], step.ground.normal, step.contact)
    })

    debug.current = {
      contact: [steps[0].contact, steps[1].contact],
      enabled: true,
      facingRadians: body.bodyFacingRadians,
      limbs: legs.map((leg, index) => limbReading(
        trace,
        ankleHeight,
        leg,
        chains[index],
        steps[index],
        states.current[index],
        body.bodyFacingRadians,
        index === 0 ? 1 : -1,
      )),
      locked: [states.current[0].planted && states.current[0].hold > 0.01, states.current[1].planted && states.current[1].hold > 0.01],
      pelvisDrop: pelvisDrop.current,
      strideScale,
      surfaceDelta: [steps[0].surfaceDelta, steps[1].surfaceDelta],
    }
  })

  return debug
}
