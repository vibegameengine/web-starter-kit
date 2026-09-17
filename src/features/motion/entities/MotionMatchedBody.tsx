import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import type { MotionIntentSource } from '../components/useKeyboardMotionIntent'
import { useMotionMatchedAnimator } from '../components/useMotionMatchedAnimator'
import type { MotionTimeline } from '../components/useMotionController'
import { useOrientationWarp } from '../components/useOrientationWarp'
import { useStrideWarpedLegs } from '../components/useStrideWarpedLegs'
import type { TraceBox } from '../systems/boxTrace'

export type MotionMatchedBodyProps = {
  readonly aimYaw: MutableRefObject<number>
  readonly ankleHeight?: number
  readonly intent: MotionIntentSource
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly topSpeed: number
  readonly trace: TraceBox
}

export function MotionMatchedBody({
  aimYaw,
  ankleHeight = 0.09,
  intent,
  rig,
  timeline,
  topSpeed,
  trace,
}: MotionMatchedBodyProps) {
  const animator = useMotionMatchedAnimator({ aimYaw, intent, rig, timeline, topSpeed })
  useOrientationWarp({ rig, timeline })
  useStrideWarpedLegs({ ankleHeight, clipSpeed: () => animator.current.clipSpeed, rig, timeline, trace })

  return <primitive object={rig} />
}
