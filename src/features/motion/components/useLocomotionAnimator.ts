import { useFrame } from '@react-three/fiber'
import { useContext, useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { AnimationMixer, Vector3 } from 'three'
import type { AnimationAction, Object3D } from 'three'

import { FixedTickContext } from '../../../shared/lib/simulation/fixedTickContext'
import { lerp } from '../../../shared/lib/simulation/renderInterpolation'
import { LOCOMOTION_CLIP_METRICS, LOCOMOTION_GAIT_SPEEDS } from '../catalog/locomotionClips'
import { normalizeAngle } from '../systems/angles'
import { horizontalSpeed } from '../systems/motionIntent'
import { locomotionSamples, mergedSamples, type LocomotionClipId, type LocomotionSample } from '../systems/locomotionPose'
import { splitSpeedRatio } from '../systems/locomotionBlend'
import type { MotionTimeline } from './useMotionController'
import { useLocomotionClips } from './useLocomotionClips'

export type LocomotionAnimatorOptions = {
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
}

export type BonePoint = readonly [number, number, number]

export type LocomotionAnimatorDebug = {
  readonly blendShare: number
  readonly cadence: number
  readonly clipSpeed: number
  readonly clock: number
  readonly grounded: boolean
  readonly phase: number
  readonly stride: number
  readonly hips: BonePoint
  readonly leftFoot: BonePoint
  readonly rightFoot: BonePoint
  readonly samples: readonly LocomotionSample[]
  readonly speed: number
  readonly weights: Readonly<Record<string, number>>
}

const FOOT_BONES = { hips: /Hips$/, leftFoot: /LeftFoot$/, rightFoot: /RightFoot$/ }

function findProbeBones(rig: Object3D): Readonly<Record<keyof typeof FOOT_BONES, Object3D | null>> {
  const found: Record<string, Object3D | null> = { hips: null, leftFoot: null, rightFoot: null }
  rig.traverse((node) => {
    for (const [key, pattern] of Object.entries(FOOT_BONES)) {
      if (!found[key] && pattern.test(node.name)) found[key] = node
    }
  })
  return found as Readonly<Record<keyof typeof FOOT_BONES, Object3D | null>>
}

function worldPoint(bone: Object3D | null, into: Vector3): BonePoint {
  if (!bone) return [0, 0, 0]
  bone.getWorldPosition(into)
  return [into.x, into.y, into.z]
}

function bodyFrameAngle(timeline: MutableRefObject<MotionTimeline>): number {
  const { bodyFacingRadians, velocity } = timeline.current.current
  if (horizontalSpeed(velocity) < 1e-4) return 0
  return normalizeAngle(Math.atan2(velocity[0], velocity[2]) - bodyFacingRadians)
}

function blendedClipSpeed(samples: readonly LocomotionSample[]): number {
  let weighted = 0
  let total = 0
  for (const sample of samples) {
    if (!sample.onDistance) continue
    const metric = LOCOMOTION_CLIP_METRICS[sample.clipId]
    if (metric.durationSeconds <= 0) continue
    weighted += sample.weight * (metric.strideLengthMeters / metric.durationSeconds)
    total += sample.weight
  }
  return total > 0 ? weighted / total : 0
}

export function useLocomotionAnimator({
  rig,
  timeline,
}: LocomotionAnimatorOptions): MutableRefObject<LocomotionAnimatorDebug> {
  const bus = useContext(FixedTickContext)
  const clips = useLocomotionClips(rig)
  const mixer = useMemo(() => new AnimationMixer(rig), [rig])
  const idleClock = useRef(0)
  const debug = useRef<LocomotionAnimatorDebug>({
    blendShare: 0,
    cadence: 1,
    clipSpeed: 0,
    clock: 0,
    grounded: true,
    phase: 0,
    stride: 1,
    hips: [0, 0, 0],
    leftFoot: [0, 0, 0],
    rightFoot: [0, 0, 0],
    samples: [],
    speed: 0,
    weights: {},
  })
  const probeBones = useMemo(() => findProbeBones(rig), [rig])
  const probePoint = useMemo(() => new Vector3(), [])

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
    const { current: state, previous } = timeline.current
    const alpha = bus ? bus.alpha() : 1
    const travelledMeters = lerp(previous.travelledMeters, state.travelledMeters, alpha)
    const speed = horizontalSpeed(state.velocity)
    idleClock.current += delta

    const moveAngle = bodyFrameAngle(timeline)
    const previousClipSpeed = debug.current.clipSpeed
    const split = splitSpeedRatio(speed, previousClipSpeed)
    const samples = mergedSamples(locomotionSamples({
      gaitSpeeds: LOCOMOTION_GAIT_SPEEDS,
      metrics: LOCOMOTION_CLIP_METRICS,
      moveAngleRadians: moveAngle,
      speed,
      travelledMeters: travelledMeters / Math.max(0.1, split.stride),
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

    const movingSample = samples.find((candidate) => candidate.onDistance)
    const duration = movingSample ? LOCOMOTION_CLIP_METRICS[movingSample.clipId].durationSeconds : 1
    mixer.update(0)
    debug.current = {
      blendShare: Math.sign(Math.cos(moveAngle)) * Math.min(1, speed / LOCOMOTION_GAIT_SPEEDS.runSpeed),
      cadence: split.cadence,
      clipSpeed: blendedClipSpeed(samples),
      clock: idleClock.current,
      grounded: state.mode === 'walking',
      phase: movingSample && duration > 0 ? movingSample.timeSeconds / duration : 0,
      stride: split.stride,
      hips: worldPoint(probeBones.hips, probePoint),
      leftFoot: worldPoint(probeBones.leftFoot, probePoint),
      rightFoot: worldPoint(probeBones.rightFoot, probePoint),
      samples,
      speed,
      weights,
    }
  })

  return debug
}
