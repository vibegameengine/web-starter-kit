import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import poseDatabaseData from '../assets/animations/poseDatabase.json'
import { LOCOMOTION_CLIP_METRICS } from '../catalog/locomotionClips'
import { horizontalSpeed, intentWishDirection } from '../systems/motionIntent'
import { splitSpeedRatio } from '../systems/locomotionBlend'
import { LOCOMOTION_GAIT_SPEEDS } from '../catalog/locomotionClips'
import type { LocomotionClipId } from '../systems/locomotionPose'
import { motionMatchQuery, trajectoryFeatureOf, type LocalPose } from '../systems/motionMatchQuery'
import { findBestPose, rankedPoses, type PoseDatabase, type PoseMatch } from '../systems/poseSearch'
import {
  DEFAULT_ACCELERATION_TIME,
  DEFAULT_TURN_TIME,
  predictTrajectory,
  type TrajectorySample,
} from '../systems/trajectoryPrediction'
import type { MotionIntentSource } from './useKeyboardMotionIntent'
import type { MotionTimeline } from './useMotionController'
import { usePoseCrossfade } from './usePoseCrossfade'
import { useRigLocalPose } from './useRigLocalPose'
import { useRootHistory } from './useRootHistory'

export type MotionMatchedAnimatorOptions = {
  readonly aimYaw: MutableRefObject<number>
  readonly intent: MotionIntentSource
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly topSpeed: number
}

export type MotionMatchedDebug = {
  readonly best: readonly { readonly clipId: string; readonly cost: number; readonly time: number }[]
  readonly blend: number
  readonly blendShare: number
  readonly cadence: number
  readonly grounded: boolean
  readonly phase: number
  readonly stride: number
  readonly clipSpeed: number
  readonly clipId: string
  readonly cost: number
  readonly searches: number
  readonly switches: number
  readonly time: number
}

const DATABASE = poseDatabaseData as unknown as PoseDatabase
const SEARCH_INTERVAL_SECONDS = 0.1
const STANDING_SPEED = 0.06
const REPHASE_SECONDS = 0.25

function clipSpeedOf(clipId: LocomotionClipId): number {
  const metric = LOCOMOTION_CLIP_METRICS[clipId]
  return metric.durationSeconds > 0 ? metric.strideLengthMeters / metric.durationSeconds : 0
}

function pastAndFuture(
  timeline: MutableRefObject<MotionTimeline>,
  history: ReturnType<typeof useRootHistory>,
  clock: number,
  topSpeed: number,
  wish: { readonly x: number; readonly z: number },
): readonly TrajectorySample[] {
  const state = timeline.current.current
  const predicted = predictTrajectory({
    accelerationTime: DEFAULT_ACCELERATION_TIME,
    currentVelocity: { x: state.velocity[0], z: state.velocity[2] },
    desiredVelocity: { x: wish.x * topSpeed, z: wish.z * topSpeed },
    facingRadians: state.bodyFacingRadians,
    offsets: DATABASE.trajectoryOffsets,
    turnTime: DEFAULT_TURN_TIME,
  })

  return DATABASE.trajectoryOffsets.map((offset, index) => {
    if (offset >= 0) {
      return {
        headingRadians: predicted[index].headingRadians,
        position: {
          x: state.position[0] + predicted[index].position.x,
          z: state.position[2] + predicted[index].position.z,
        },
      }
    }
    const past = history.sampleAt(clock + offset)
    return { headingRadians: past.facingRadians, position: { x: past.x, z: past.z } }
  })
}

export function useMotionMatchedAnimator(options: MotionMatchedAnimatorOptions): MutableRefObject<MotionMatchedDebug> {
  const { aimYaw, intent, rig, timeline, topSpeed } = options
  const crossfade = usePoseCrossfade(rig)
  const readLocalPose = useRigLocalPose(rig)
  const history = useRootHistory()
  const clock = useRef(0)
  const sinceSearch = useRef(SEARCH_INTERVAL_SECONDS)
  const previousPose = useRef<LocalPose | null>(null)
  const match = useRef<PoseMatch | null>(null)
  const counters = useMemo(() => ({ searches: 0, switches: 0 }), [])
  const debug = useRef<MotionMatchedDebug>({
    best: [],
    blend: 1,
    blendShare: 0,
    cadence: 1,
    grounded: true,
    phase: 0,
    stride: 1,
    clipId: 'idle',
    clipSpeed: 0,
    cost: 0,
    searches: 0,
    switches: 0,
    time: 0,
  })

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const target = window as Window & { __motionMatching?: () => MotionMatchedDebug }
    target.__motionMatching = () => debug.current
    return () => {
      delete target.__motionMatching
    }
  }, [])

  const search = (deltaSeconds: number) => {
    const current = readLocalPose()
    if (!current) return
    const previous = previousPose.current ?? current
    previousPose.current = current

    const state = timeline.current.current
    const wish = intentWishDirection(intent.read(aimYaw.current))
    const samples = pastAndFuture(timeline, history, clock.current, topSpeed, wish)
    const trajectory = trajectoryFeatureOf(samples, {
      facingRadians: state.bodyFacingRadians,
      x: state.position[0],
      z: state.position[2],
    })
    const query = motionMatchQuery({ current, deltaSeconds, previous, trajectory })
    if (query.length !== DATABASE.dimensions) return

    const found = findBestPose(DATABASE, query, { continuing: match.current })
    counters.searches += 1
    const playing = crossfade.playing()
    if (found.clipId !== playing.clipId || Math.abs(found.time - playing.time) > REPHASE_SECONDS) {
      crossfade.switchTo({ clipId: found.clipId as LocomotionClipId, time: found.time })
      counters.switches += 1
    }
    match.current = found
    debug.current = {
      ...debug.current,
      best: rankedPoses(DATABASE, query, 3).map((pose) => ({
        clipId: pose.clipId,
        cost: Number(pose.cost.toFixed(3)),
        time: Number(pose.time.toFixed(2)),
      })),
      cost: found.cost,
    }
  }

  useFrame((_, delta) => {
    const state = timeline.current.current
    clock.current += delta
    history.push({
      facingRadians: state.bodyFacingRadians,
      time: clock.current,
      x: state.position[0],
      z: state.position[2],
    })

    const speed = horizontalSpeed(state.velocity)
    if (speed < STANDING_SPEED) {
      crossfade.playIdle(clock.current)
      debug.current = { ...debug.current, ...counters, blend: 1, clipId: 'idle', time: clock.current }
      return
    }

    sinceSearch.current += delta
    if (sinceSearch.current >= SEARCH_INTERVAL_SECONDS) {
      const elapsed = sinceSearch.current
      sinceSearch.current = 0
      search(elapsed)
    }

    const playing = crossfade.playing()
    const clipSpeed = clipSpeedOf(playing.clipId)
    const split = splitSpeedRatio(speed, clipSpeed)
    crossfade.advance(delta, split.cadence)
    if (match.current) match.current = { ...match.current, time: playing.time }
    const duration = crossfade.durationOf(playing.clipId)
    debug.current = {
      ...debug.current,
      ...counters,
      blend: crossfade.blend(),
      blendShare: Math.min(1, speed / LOCOMOTION_GAIT_SPEEDS.runSpeed),
      cadence: split.cadence,
      clipId: playing.clipId,
      clipSpeed,
      grounded: state.mode === 'walking',
      phase: duration > 0 ? playing.time / duration : 0,
      stride: split.stride,
      time: playing.time,
    }
  })

  return debug
}
