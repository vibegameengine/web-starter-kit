import { useFrame } from '@react-three/fiber'
import { useContext } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { Object3D } from 'three'

import { FixedTickContext } from '../../../shared/lib/simulation/fixedTickContext'
import { lerp, lerpAngle } from '../../../shared/lib/simulation/renderInterpolation'
import type { MotionTimeline } from './useMotionController'

export function useInterpolatedMotion(
  target: RefObject<Object3D | null>,
  timeline: MutableRefObject<MotionTimeline>,
): void {
  const bus = useContext(FixedTickContext)

  useFrame(() => {
    const object = target.current
    if (!object) return

    const alpha = bus ? bus.alpha() : 1
    const { current, previous } = timeline.current
    object.position.set(
      lerp(previous.position[0], current.position[0], alpha),
      lerp(previous.position[1], current.position[1], alpha),
      lerp(previous.position[2], current.position[2], alpha),
    )
    object.rotation.y = lerpAngle(previous.bodyFacingRadians, current.bodyFacingRadians, alpha)
  })
}
