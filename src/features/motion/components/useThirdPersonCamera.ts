import { useFrame } from '@react-three/fiber'
import type { MutableRefObject } from 'react'
import { Vector3 } from 'three'

import type { MotionTimeline } from './useMotionController'

export type ThirdPersonCameraOptions = {
  readonly followRate: number
  readonly lookHeight: number
  readonly offset: readonly [number, number, number]
}

export const DEFAULT_THIRD_PERSON_CAMERA: ThirdPersonCameraOptions = {
  followRate: 6,
  lookHeight: 1.2,
  offset: [0, 3.4, -6.4],
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
    camera.position.lerp(wanted, Math.min(1, options.followRate * delta))
    camera.lookAt(focus)
  })
}
