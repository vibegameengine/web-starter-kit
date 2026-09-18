import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import { MAX_SMOOTHING_SECONDS } from '../systems/footPlanting'
import { travelAngleOf } from '../systems/locomotionDirection'
import { horizontalSpeed } from '../systems/motionIntent'
import { easedWarp, orientationWarpFor, type OrientationWarp } from '../systems/orientationWarp'
import type { MotionTimeline } from './useMotionController'

export type OrientationWarpOptions = {
  readonly enabled?: () => boolean
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly warpRate?: number
}

const SPINE_BONES = [/Spine$/, /Spine1$/, /Spine2$/]
const UP = new Vector3(0, 1, 0)
const NO_WARP: OrientationWarp = { pelvisYawRadians: 0, spineYawRadians: 0 }

function boneNamed(rig: Object3D, pattern: RegExp): Object3D | null {
  let found: Object3D | null = null
  rig.traverse((node) => {
    if (!found && pattern.test(node.name)) found = node
  })
  return found
}

function travelAngle(timeline: MutableRefObject<MotionTimeline>): number {
  const { bodyFacingRadians, velocity } = timeline.current.current
  if (horizontalSpeed(velocity) < 0.05) return 0
  return travelAngleOf({ x: velocity[0], z: velocity[2] }, bodyFacingRadians)
}

export function useOrientationWarp({ enabled, rig, timeline, warpRate = 8 }: OrientationWarpOptions): void {
  const hips = useMemo(() => boneNamed(rig, /Hips$/), [rig])
  const spine = useMemo(() => SPINE_BONES.map((pattern) => boneNamed(rig, pattern)).filter(Boolean) as Object3D[], [rig])
  const warp = useRef<OrientationWarp>(NO_WARP)
  const turn = useMemo(() => new Quaternion(), [])

  useFrame((_, delta) => {
    if (!hips || spine.length === 0 || (enabled && !enabled())) return
    warp.current = easedWarp(
      warp.current,
      orientationWarpFor(travelAngle(timeline)),
      warpRate * Math.min(delta, MAX_SMOOTHING_SECONDS),
    )
    if (Math.abs(warp.current.pelvisYawRadians) < 1e-4) return

    turn.setFromAxisAngle(UP, warp.current.pelvisYawRadians)
    hips.quaternion.premultiply(turn)

    const perBone = warp.current.spineYawRadians / spine.length
    turn.setFromAxisAngle(UP, perBone)
    for (const bone of spine) bone.quaternion.premultiply(turn)
    rig.updateMatrixWorld(true)
  })
}
