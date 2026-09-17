import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { AnimationMixer } from 'three'
import type { AnimationAction, Object3D } from 'three'

import { LOCOMOTION_CLIP_METRICS, LOCOMOTION_GAIT_SPEEDS } from '../catalog/locomotionClips'
import { normalizeAngle } from '../systems/angles'
import { horizontalSpeed } from '../systems/motionIntent'
import { locomotionSamples, mergedSamples, type LocomotionClipId, type LocomotionSample } from '../systems/locomotionPose'
import type { MotionTimeline } from './useMotionController'
import { useLocomotionClips } from './useLocomotionClips'

export type LocomotionAnimatorOptions = {
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
}

export type LocomotionAnimatorDebug = {
  readonly clock: number
  readonly samples: readonly LocomotionSample[]
  readonly weights: Readonly<Record<string, number>>
}

function bodyFrameAngle(timeline: MutableRefObject<MotionTimeline>): number {
  const { bodyFacingRadians, velocity } = timeline.current.current
  if (horizontalSpeed(velocity) < 1e-4) return 0
  return normalizeAngle(Math.atan2(velocity[0], velocity[2]) - bodyFacingRadians)
}

export function useLocomotionAnimator({ rig, timeline }: LocomotionAnimatorOptions): void {
  const clips = useLocomotionClips(rig)
  const mixer = useMemo(() => new AnimationMixer(rig), [rig])
  const idleClock = useRef(0)
  const debug = useRef<LocomotionAnimatorDebug>({ clock: 0, samples: [], weights: {} })

  const actions = useMemo(() => {
    const built = new Map<LocomotionClipId, AnimationAction>()
    for (const [id, clip] of Object.entries(clips) as readonly [LocomotionClipId, typeof clips[LocomotionClipId]][]) {
      const action = mixer.clipAction(clip)
      action.enabled = true
      action.setEffectiveWeight(0)
      action.play()
      built.set(id, action)
    }
    return built
  }, [clips, mixer])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const target = window as Window & { __motionAnimator?: () => LocomotionAnimatorDebug }
    target.__motionAnimator = () => debug.current
    return () => {
      delete target.__motionAnimator
    }
  }, [])

  useEffect(() => () => {
    mixer.stopAllAction()
  }, [mixer])

  useFrame((_, delta) => {
    const state = timeline.current.current
    const speed = horizontalSpeed(state.velocity)
    idleClock.current += delta

    const samples = mergedSamples(locomotionSamples({
      gaitSpeeds: LOCOMOTION_GAIT_SPEEDS,
      metrics: LOCOMOTION_CLIP_METRICS,
      moveAngleRadians: bodyFrameAngle(timeline),
      speed,
      travelledMeters: state.travelledMeters,
    }))

    const weights: Record<string, number> = {}
    for (const [id, action] of actions) {
      const sample = samples.find((candidate) => candidate.clipId === id)
      const weight = sample?.weight ?? 0
      action.setEffectiveWeight(weight)
      weights[id] = weight
      if (!sample) continue
      action.timeScale = sample.rate
      action.time = sample.onDistance
        ? sample.timeSeconds
        : idleClock.current % action.getClip().duration
    }

    mixer.update(0)
    debug.current = { clock: idleClock.current, samples, weights }
  })
}
