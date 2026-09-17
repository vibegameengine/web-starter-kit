import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { Vector3 } from 'three'
import type { Object3D } from 'three'

import { aimBoneAlong } from '../../../shared/lib/animation/boneAim'
import { solveTwoBoneIk } from '../../../shared/lib/animation/twoBoneIk'
import type { TraceBox, Vector3Tuple } from '../systems/boxTrace'
import { groundedFootTarget, pelvisDropFor, strideScaleFor, warpedFootTarget } from '../systems/strideWarp'
import type { MotionTimeline } from './useMotionController'

export type StrideWarpedLegsOptions = {
  readonly ankleHeight: number
  readonly clipSpeed: () => number
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly trace: TraceBox
}

type LegBones = {
  readonly foot: Object3D
  readonly knee: Object3D
  readonly thigh: Object3D
}

const GROUND_PROBE_HALF_EXTENTS: Vector3Tuple = [0.02, 0.02, 0.02]
const GROUND_PROBE_RISE = 1.2
const GROUND_PROBE_DROP = 2.4

function boneNamed(rig: Object3D, pattern: RegExp): Object3D {
  let found: Object3D | null = null
  rig.traverse((node) => {
    if (!found && pattern.test(node.name)) found = node
  })
  if (!found) throw new Error(`rig has no bone matching ${pattern.source}`)
  return found
}

function legOf(rig: Object3D, side: 'Left' | 'Right'): LegBones {
  return {
    foot: boneNamed(rig, new RegExp(`${side}Foot$`)),
    knee: boneNamed(rig, new RegExp(`${side}Leg$`)),
    thigh: boneNamed(rig, new RegExp(`${side}UpLeg$`)),
  }
}

function groundHeightAt(point: Readonly<Vector3>, trace: TraceBox): number | null {
  const from: Vector3Tuple = [point.x, point.y + GROUND_PROBE_RISE, point.z]
  const to: Vector3Tuple = [from[0], from[1] - GROUND_PROBE_DROP, from[2]]
  const hit = trace(from, to, GROUND_PROBE_HALF_EXTENTS)
  if (!hit.hit || hit.startSolid) return null
  return from[1] - GROUND_PROBE_DROP * hit.fraction - GROUND_PROBE_HALF_EXTENTS[1]
}

export type StrideWarpedLegsDebug = {
  readonly hips: readonly [number, number, number]
  readonly leftFoot: readonly [number, number, number]
  readonly pelvisDrop: number
  readonly rightFoot: readonly [number, number, number]
  readonly strideScale: number
}

export function useStrideWarpedLegs(options: StrideWarpedLegsOptions): void {
  const { ankleHeight, clipSpeed, rig, timeline, trace } = options
  const legs = useMemo(() => [legOf(rig, 'Left'), legOf(rig, 'Right')], [rig])
  const scratch = useMemo(() => ({
    hip: new Vector3(),
    hips: [new Vector3(), new Vector3()],
    knee: new Vector3(),
    stride: new Vector3(),
    target: new Vector3(),
    targets: [new Vector3(), new Vector3()],
    toe: new Vector3(),
  }), [])
  const hipsBone = useMemo(() => boneNamed(rig, /Hips$/), [rig])
  const debug = useRef<StrideWarpedLegsDebug>({
    hips: [0, 0, 0],
    leftFoot: [0, 0, 0],
    pelvisDrop: 0,
    rightFoot: [0, 0, 0],
    strideScale: 1,
  })
  const lengths = useMemo(() => legs.map((leg) => ({
    lowerLength: leg.knee.getWorldPosition(new Vector3()).distanceTo(leg.foot.getWorldPosition(new Vector3())),
    upperLength: leg.thigh.getWorldPosition(new Vector3()).distanceTo(leg.knee.getWorldPosition(new Vector3())),
  })), [legs])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const target = window as Window & { __motionLegs?: () => StrideWarpedLegsDebug }
    target.__motionLegs = () => debug.current
    return () => {
      delete target.__motionLegs
    }
  }, [])

  useFrame(() => {
    const state = timeline.current.current
    const speed = Math.hypot(state.velocity[0], state.velocity[2])
    if (speed < 0.05) return

    scratch.stride.set(state.velocity[0], 0, state.velocity[2]).normalize()
    const strideScale = strideScaleFor(speed, clipSpeed())

    for (let index = 0; index < legs.length; index += 1) {
      const leg = legs[index]
      leg.thigh.getWorldPosition(scratch.hips[index])
      leg.foot.getWorldPosition(scratch.target)
      warpedFootTarget(scratch.target, scratch.hips[index], scratch.stride, strideScale, scratch.targets[index])
      const ground = groundHeightAt(scratch.targets[index], trace)
      if (ground !== null) groundedFootTarget(scratch.targets[index], ground, ankleHeight)
    }

    const drop = pelvisDropFor(scratch.hips, scratch.targets, lengths[0].lowerLength + lengths[0].upperLength)
    if (drop > 0) {
      hipsBone.getWorldPosition(scratch.hip)
      scratch.hip.setY(scratch.hip.y - drop)
      hipsBone.parent?.worldToLocal(scratch.hip)
      hipsBone.position.copy(scratch.hip)
      rig.updateMatrixWorld(true)
    }

    for (let index = 0; index < legs.length; index += 1) {
      const leg = legs[index]
      leg.thigh.getWorldPosition(scratch.hip)
      leg.knee.getWorldPosition(scratch.knee)
      const solved = solveTwoBoneIk(scratch.hip, scratch.knee, scratch.targets[index], lengths[index])
      aimBoneAlong(leg.thigh, scratch.knee.sub(scratch.hip), solved.mid.clone().sub(scratch.hip))
      leg.thigh.updateMatrixWorld(true)
      leg.knee.getWorldPosition(scratch.knee)
      leg.foot.getWorldPosition(scratch.toe)
      aimBoneAlong(leg.knee, scratch.toe.sub(scratch.knee), solved.tip.clone().sub(scratch.knee))
      leg.knee.updateMatrixWorld(true)
    }

    legs[0].foot.getWorldPosition(scratch.hip)
    const left: readonly [number, number, number] = [scratch.hip.x, scratch.hip.y, scratch.hip.z]
    legs[1].foot.getWorldPosition(scratch.hip)
    const right: readonly [number, number, number] = [scratch.hip.x, scratch.hip.y, scratch.hip.z]
    hipsBone.getWorldPosition(scratch.hip)
    debug.current = {
      hips: [scratch.hip.x, scratch.hip.y, scratch.hip.z],
      leftFoot: left,
      pelvisDrop: drop,
      rightFoot: right,
      strideScale,
    }
  })
}
