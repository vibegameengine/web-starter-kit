import { useFrame } from '@react-three/fiber'
import type { MutableRefObject } from 'react'
import { Vector3 } from 'three'

import type { TraceBox, Vector3Tuple } from '../systems/boxTrace'
import type { MotionTimeline } from './useMotionController'

export type ThirdPersonCameraOptions = {
  readonly followRate: number
  readonly lookHeight: number
  readonly offset: readonly [number, number, number]
  readonly trace?: TraceBox
}

const CAMERA_PROBE_HALF_EXTENTS: Vector3Tuple = [0.12, 0.12, 0.12]
const CAMERA_WALL_MARGIN = 0.12

export const DEFAULT_THIRD_PERSON_CAMERA: ThirdPersonCameraOptions = {
  followRate: 6,
  lookHeight: 1,
  offset: [-3.2, 1.9, -3.4],
}

function springArmLimit(focus: Vector3, wanted: Vector3, trace: TraceBox): void {
  const from: Vector3Tuple = [focus.x, focus.y, focus.z]
  const to: Vector3Tuple = [wanted.x, wanted.y, wanted.z]
  const hit = trace(from, to, CAMERA_PROBE_HALF_EXTENTS)
  if (!hit.hit || hit.startSolid) return
  const reach = Math.max(0, hit.fraction - CAMERA_WALL_MARGIN / Math.max(1e-4, focus.distanceTo(wanted)))
  wanted.lerpVectors(focus, wanted, reach)
}

export function useThirdPersonCamera(
  timeline: MutableRefObject<MotionTimeline>,
  options: ThirdPersonCameraOptions = DEFAULT_THIRD_PERSON_CAMERA,
): void {
  const wanted = new Vector3()
  const focus = new Vector3()

  useFrame(({ camera }, delta) => {
    const { position } = timeline.current.current
    focus.set(position[0], position[1] + options.lookHeight, position[2])
    wanted.set(
      position[0] + options.offset[0],
      position[1] + options.offset[1],
      position[2] + options.offset[2],
    )
    if (options.trace) springArmLimit(focus, wanted, options.trace)
    camera.position.lerp(wanted, Math.min(1, options.followRate * delta))
    camera.lookAt(focus)
  })
}
