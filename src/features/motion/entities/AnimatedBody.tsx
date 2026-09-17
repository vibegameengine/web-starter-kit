import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import { useLocomotionAnimator } from '../components/useLocomotionAnimator'
import { useOrientationWarp } from '../components/useOrientationWarp'
import type { MotionTimeline } from '../components/useMotionController'
import { useFootPlacement } from '../components/useFootPlacement'
import type { TraceBox } from '../systems/boxTrace'

export type AnimatedBodyProps = {
  readonly ankleHeight?: number
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly trace: TraceBox
}

export function AnimatedBody({ ankleHeight = 0.09, rig, timeline, trace }: AnimatedBodyProps) {
  const animator = useLocomotionAnimator({ rig, timeline })
  useOrientationWarp({ rig, timeline })
  useFootPlacement({
    ankleHeight,
    gait: () => ({
      blendShare: animator.current.blendShare,
      clipSpeed: animator.current.clipSpeed,
      grounded: animator.current.grounded,
      phase: animator.current.phase,
      stride: animator.current.stride,
    }),
    rig,
    timeline,
    trace,
  })

  return <primitive object={rig} />
}
