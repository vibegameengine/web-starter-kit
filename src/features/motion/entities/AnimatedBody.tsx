import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import { useLocomotionAnimator } from '../components/useLocomotionAnimator'
import type { MotionTimeline } from '../components/useMotionController'

export type AnimatedBodyProps = {
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
}

export function AnimatedBody({ rig, timeline }: AnimatedBodyProps) {
  useLocomotionAnimator({ rig, timeline })

  return <primitive object={rig} />
}
