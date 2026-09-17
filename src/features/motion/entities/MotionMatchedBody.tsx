import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import type { MotionIntentSource } from '../components/useKeyboardMotionIntent'
import { useMotionMatchedAnimator } from '../components/useMotionMatchedAnimator'
import type { MotionTimeline } from '../components/useMotionController'
import { useOrientationWarp } from '../components/useOrientationWarp'
import { useFootPlacement } from '../components/useFootPlacement'
import type { TraceBox } from '../systems/boxTrace'
import type { MotionProfile } from '../systems/motionProfile'
import type { ProceduralPasses } from '../systems/proceduralPasses'

export type MotionMatchedBodyProps = {
  readonly aimYaw: MutableRefObject<number>
  readonly ankleHeight?: number
  readonly passes?: () => ProceduralPasses
  readonly profile: MotionProfile
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
  passes,
  profile,
  rig,
  timeline,
  topSpeed,
  trace,
}: MotionMatchedBodyProps) {
  const animator = useMotionMatchedAnimator({ aimYaw, intent, profile, rig, timeline, topSpeed })
  useOrientationWarp({ enabled: () => (passes ? passes().warp : true), rig, timeline })
  useFootPlacement({
    ankleHeight,
    enabled: () => (passes ? passes().feet : true),
    gait: () => ({
      blendShare: animator.current.blendShare,
      clipId: animator.current.clipId as never,
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
