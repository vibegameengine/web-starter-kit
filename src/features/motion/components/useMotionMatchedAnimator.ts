/* eslint-disable react-hooks/immutability -- the search counters and the
   playhead are per-frame simulation state, never render input. */
import { useFrame } from '@react-three/fiber'
import { useContext, useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import poseDatabaseData from '../assets/animations/poseDatabase.json'
import {
  LOCOMOTION_CLIP_METRICS,
  LOCOMOTION_PHASE_OFFSETS,
  LOCOMOTION_STANCE_WINDOWS,
} from '../catalog/locomotionClips'
import { phaseScaleToPlant, stopDistance, STOP_MATCH_DISTANCE_METERS } from '../systems/stopMatching'
import { chooseGait, DEFAULT_GAIT_HYSTERESIS, type Gait } from '../systems/gaitChooser'
import { approachWeight } from '../systems/footPlanting'
import { wrapPhase } from '../systems/phaseAlign'
import { alignedPhase } from '../systems/phaseAlign'
import {
  directionalBlend,
  RUN_DIRECTIONS,
  WALK_DIRECTIONS,
  withSpeeds,
} from '../systems/directionalBlend'
import { travelAngleOf } from '../systems/locomotionDirection'
import { horizontalSpeed, intentWishDirection } from '../systems/motionIntent'
import { advancePhase, splitSpeedRatio, strideLengthOf } from '../systems/locomotionBlend'
import { LOCOMOTION_GAIT_SPEEDS } from '../catalog/locomotionClips'
import type { LocomotionClipId } from '../systems/locomotionPose'
import { motionMatchQuery, trajectoryFeatureOf, type LocalPose } from '../systems/motionMatchQuery'
import { FixedTickContext } from '../../../shared/lib/simulation/fixedTickContext'
import { lerp } from '../../../shared/lib/simulation/renderInterpolation'
import { findBestPose, rankedPoses, type PoseDatabase, type PoseMatch } from '../systems/poseSearch'
import {
  DEFAULT_ACCELERATION_TIME,
  DEFAULT_TURN_TIME,
  predictTrajectory,
  type TrajectorySample,
} from '../systems/trajectoryPrediction'
import type { MotionIntentSource } from './useKeyboardMotionIntent'
import type { MotionProfile } from '../systems/motionProfile'
import type { MotionTimeline } from './useMotionController'
import { airLayer, GROUNDED_AIR, stepAir, timeToLand, type AirPhase, type AirState } from '../systems/airborne'
import { usePoseCrossfade, type BlendEntry } from './usePoseCrossfade'
import { airTimingsOf, useRetargetedClips } from './useRetargetedClips'
import { useRigLocalPose } from './useRigLocalPose'
import { useRootHistory } from './useRootHistory'

export type MotionMatchedAnimatorOptions = {
  readonly aimYaw: MutableRefObject<number>
  readonly intent: MotionIntentSource
  readonly profile: MotionProfile
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly topSpeed: number
}

export type MotionMatchedDebug = {
  readonly air: AirPhase
  readonly airWeight: number
  readonly gait: Gait
  readonly idleShare: number
  readonly stopIn: number
  readonly stopScale: number
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
const WALK_SET = withSpeeds(WALK_DIRECTIONS, clipSpeedOf)
const RUN_SET = withSpeeds(RUN_DIRECTIONS, clipSpeedOf)
const SEARCH_INTERVAL_SECONDS = 0.1
const STANDING_SPEED = 0.06
const IDLE_BLEND_SPEED = 0.45
const IDLE_BLEND_RATE = 7

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

type StopMatchInput = {
  readonly leadingClip: LocomotionClipId
  readonly phase: number
  readonly profile: MotionProfile
  readonly speed: number
  readonly stopping: boolean
  readonly strideLength: number
}

function stopMatch(input: StopMatchInput): { readonly phaseScale: number; readonly remaining: number } {
  if (!input.stopping) return { phaseScale: 1, remaining: 0 }
  const remaining = stopDistance(input.speed, input.profile)
  if (remaining > STOP_MATCH_DISTANCE_METERS) return { phaseScale: 1, remaining }
  const windows = LOCOMOTION_STANCE_WINDOWS[input.leadingClip]
  const plants = [windows.left[0], windows.right[0]]
  const match = phaseScaleToPlant(input.phase, remaining, input.strideLength, plants)
  return { phaseScale: match.phaseScale, remaining }
}

function idleEntry(share: number, idleDuration: number, clock: number): BlendEntry[] {
  if (share <= 0.001 || idleDuration <= 0) return []
  return [{ clipId: 'idle', phase: wrapPhase(clock / idleDuration), weight: share }]
}

export function useMotionMatchedAnimator(options: MotionMatchedAnimatorOptions): MutableRefObject<MotionMatchedDebug> {
  const { aimYaw, intent, profile, rig, timeline, topSpeed } = options
  const bus = useContext(FixedTickContext)
  const crossfade = usePoseCrossfade(rig)
  const readLocalPose = useRigLocalPose(rig)
  const history = useRootHistory()
  const clock = useRef(0)
  const sinceSearch = useRef(SEARCH_INTERVAL_SECONDS)
  const previousPose = useRef<LocalPose | null>(null)
  const match = useRef<PoseMatch | null>(null)
  const chosen = useRef<LocomotionClipId>('walk-forward')
  const counters = useMemo(() => ({ searches: 0, switches: 0 }), [])
  const phase = useRef(0)
  const lastTravelled = useRef(0)
  const idleShare = useRef(1)
  const gait = useRef<Gait>('walk')
  const airClips = useRetargetedClips(rig)
  const airTimings = useMemo(() => airTimingsOf(airClips, profile.jumpVelocity), [airClips, profile.jumpVelocity])
  const air = useRef<AirState>(GROUNDED_AIR)
  const lastAirClock = useRef<number | null>(null)
  const debug = useRef<MotionMatchedDebug>({
    air: 'ground',
    airWeight: 0,
    best: [],
    gait: 'walk',
    idleShare: 1,
    stopIn: 0,
    stopScale: 1,
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
    if (found.clipId !== crossfade.playing().clipId) {
      chosen.current = found.clipId as LocomotionClipId
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
    const wish = intentWishDirection(intent.read(aimYaw.current))
    const stopping = Math.hypot(wish.x, wish.z) < 1e-4
    /* @important The jump runs on the same interpolated simulation clock the
       stride phase does, so between two ticks the air clips keep moving with
       the body instead of standing still and catching up. */
    const airClock = lerp(timeline.current.previous.elapsedSeconds, state.elapsedSeconds, bus ? bus.alpha() : 1)
    const airInput = {
      deltaSeconds: lastAirClock.current === null ? 0 : Math.max(0, airClock - lastAirClock.current),
      landing: state.landing,
      moving: !stopping,
      now: state.elapsedSeconds,
      takeoff: state.takeoff,
      timeToLand: state.mode === 'falling' ? timeToLand(state.groundBelow, state.velocity[1], profile.gravity) : null,
    }
    lastAirClock.current = airClock
    air.current = stepAir(air.current, airInput, airTimings)
    const layer = airLayer(air.current, airInput, airTimings)
    crossfade.overlay(layer ? { clip: airClips[layer.clip], time: layer.time, weight: layer.weight } : null)
    debug.current = {
      ...debug.current,
      air: air.current.phase,
      airWeight: layer?.weight ?? 0,
      grounded: air.current.phase === 'ground' || air.current.phase === 'land',
    }
    idleShare.current = approachWeight(
      idleShare.current,
      stopping ? 1 - Math.min(1, speed / IDLE_BLEND_SPEED) : 0,
      IDLE_BLEND_RATE,
      delta,
    )
    if (speed < STANDING_SPEED && idleShare.current > 0.99) {
      crossfade.playIdle(clock.current)
      lastTravelled.current = state.travelledMeters
      debug.current = {
        ...debug.current,
        ...counters,
        blend: 1,
        clipId: 'idle',
        idleShare: 1,
        stopIn: 0,
        stopScale: 1,
        time: clock.current,
      }
      return
    }

    sinceSearch.current += delta
    if (sinceSearch.current >= SEARCH_INTERVAL_SECONDS) {
      const elapsed = sinceSearch.current
      sinceSearch.current = 0
      search(elapsed)
    }

    const travelAngle = travelAngleOf(
      { x: state.velocity[0], z: state.velocity[2] },
      state.bodyFacingRadians,
    )
    gait.current = chooseGait({
      hysteresis: DEFAULT_GAIT_HYSTERESIS,
      previous: gait.current,
      runSpeed: LOCOMOTION_GAIT_SPEEDS.runSpeed,
      speed,
      walkSpeed: LOCOMOTION_GAIT_SPEEDS.walkSpeed,
    })
    const blend = directionalBlend(travelAngle, gait.current === 'run' ? RUN_SET : WALK_SET)
    const clipSpeed = blend.speed
    const split = splitSpeedRatio(speed, clipSpeed)
    const duration = crossfade.durationOf(blend.clips[0].clipId)
    const strideLength = strideLengthOf(clipSpeed, duration) * Math.max(0.1, split.stride)
    /* @important The phase advances on the INTERPOLATED distance, the same
       interpolation the mesh is drawn at. With the alpha fixed at one the pose
       only moved when a tick ran, so between ticks the body glided and the legs
       stood still, then caught up: 15 to 18 percent of rendered frames had the
       legs frozen, which is the ghosting on the legs. */
    const travelled = lerp(
      timeline.current.previous.travelledMeters,
      state.travelledMeters,
      bus ? bus.alpha() : 1,
    )
    const travelDelta = Math.max(0, travelled - lastTravelled.current)
    lastTravelled.current = travelled
    const stop = stopMatch({
      leadingClip: blend.clips[0].clipId,
      phase: phase.current,
      speed,
      profile,
      stopping,
      strideLength,
    })
    phase.current = advancePhase(phase.current, travelDelta * stop.phaseScale, strideLength)
    crossfade.blendAtPhase(idleEntry(idleShare.current, crossfade.durationOf('idle'), clock.current).concat(
      blend.clips.map((entry) => ({
        clipId: entry.clipId,
        phase: alignedPhase(phase.current, LOCOMOTION_PHASE_OFFSETS[entry.clipId]),
        weight: entry.weight * (1 - idleShare.current),
      })),
    ))
    const playing = crossfade.playing()
    if (match.current) match.current = { ...match.current, time: playing.time }
    debug.current = {
      ...debug.current,
      ...counters,
      blend: crossfade.blend(),
      blendShare: Math.min(1, speed / LOCOMOTION_GAIT_SPEEDS.runSpeed),
      gait: gait.current,
      idleShare: idleShare.current,
      stopIn: stop.remaining,
      stopScale: stop.phaseScale,
      cadence: split.cadence,
      clipId: playing.clipId,
      clipSpeed,
      grounded: air.current.phase === 'ground' || air.current.phase === 'land',
      phase: duration > 0 ? playing.time / duration : 0,
      stride: split.stride,
      time: playing.time,
    }
  })

  return debug
}
