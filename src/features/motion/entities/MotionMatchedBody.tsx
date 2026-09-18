import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import type { MotionIntentSource } from '../components/useKeyboardMotionIntent'
import { useMotionMatchedAnimator } from '../components/useMotionMatchedAnimator'
import type { MotionTimeline } from '../components/useMotionController'
import { useInertialBlend } from '../components/useInertialBlend'
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
  const lastDelta = useRef(1 / 60)
  useFrame((_, delta) => {
    lastDelta.current = delta
  })
  /* @important The gait and the handover to idle get the transition; the clip
     the directional blend happens to lead with does not. Including it was
     measured and made things worse — that crossover is already continuous in
     weight, and starting a blend in the middle of it perturbs a pose that was
     fine. */
  useInertialBlend(
    rig,
    () => lastDelta.current,
    () => `${animator.current.gait}:${animator.current.idleShare > 0.5 ? 'idle' : 'move'}`,
  )
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
