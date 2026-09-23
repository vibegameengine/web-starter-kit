import type { RetargetedClipId } from '../catalog/retargetedClips'
import { smoothStep } from './footPlanting'
import { DEFAULT_INERTIAL_SECONDS } from './inertialBlend'
import type { Landing, Takeoff } from './motionController'

export type AirPhase = 'fall' | 'ground' | 'land' | 'reach' | 'rise'

export type AirState = {
  readonly landWeight: number
  readonly phase: AirPhase
  readonly seenLanding: number
  readonly seenTakeoff: number
  readonly time: number
}

export type AirTimings = {
  readonly absorb: number
  readonly jumpSpeed: number
  readonly loopDuration: number
  readonly riseDuration: number
  readonly settle: number
  readonly takeoff: number
  readonly touchdown: number
}

export type AirInput = {
  readonly deltaSeconds: number
  readonly landing: Landing | null
  readonly moving: boolean
  readonly now: number
  readonly takeoff: Takeoff | null
  readonly timeToLand: number | null
}

export type AirLayer = {
  readonly clip: RetargetedClipId
  readonly time: number
  readonly weight: number
}

const GRAVITY = 9.81

/* @important Walking off an edge only counts as falling after as long as a
   20 cm drop takes, deeper than a stair riser: the collider leaves every tread
   on the way down a flight for a few ticks, and each of those must stay a step,
   not become the air loop and a landing. */
export const MIN_FALL_SECONDS = Math.sqrt((2 * 0.2) / GRAVITY)

export const LIGHT_LAND_SPEED = GRAVITY * MIN_FALL_SECONDS

export const LAND_FADE_SECONDS = 0.15

export const REACH_SECONDS = DEFAULT_INERTIAL_SECONDS

export const GROUNDED_AIR: AirState = { landWeight: 0, phase: 'ground', seenLanding: -1, seenTakeoff: -1, time: 0 }

function afterTakeoff(state: AirState, input: AirInput, timings: AirTimings): AirState {
  const { takeoff } = input
  if (!takeoff || takeoff.atSeconds <= state.seenTakeoff) return state
  if (takeoff.jumped) return { ...state, phase: 'rise', seenTakeoff: takeoff.atSeconds, time: timings.takeoff }
  if (input.now - takeoff.atSeconds < MIN_FALL_SECONDS) return state
  return { ...state, phase: 'fall', seenTakeoff: takeoff.atSeconds, time: 0 }
}

export function timeToLand(distance: number | null, verticalSpeed: number, gravity: number): number | null {
  if (distance === null || gravity <= 0) return null
  return (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * gravity * Math.max(0, distance))) / gravity
}

function afterReach(state: AirState, input: AirInput, timings: AirTimings): AirState {
  const soon = input.timeToLand !== null && input.timeToLand <= REACH_SECONDS
  if ((state.phase === 'rise' || state.phase === 'fall') && soon) return { ...state, phase: 'reach', time: timings.touchdown }
  const gone = input.timeToLand === null || input.timeToLand > 2 * REACH_SECONDS
  if (state.phase === 'reach' && gone) return { ...state, phase: 'fall', time: 0 }
  return state
}

function landWeightFor(speed: number, timings: AirTimings): number {
  const span = Math.max(1e-6, timings.jumpSpeed - LIGHT_LAND_SPEED)
  return Math.min(1, Math.max(0, (speed - LIGHT_LAND_SPEED) / span))
}

function afterLanding(state: AirState, input: AirInput, timings: AirTimings): AirState {
  const { landing, takeoff } = input
  if (!landing || landing.atSeconds <= state.seenLanding) return state
  const consumed = { ...state, seenLanding: landing.atSeconds, seenTakeoff: Math.max(state.seenTakeoff, takeoff?.atSeconds ?? -1) }
  const wasAirborne = state.phase === 'rise' || state.phase === 'fall' || state.phase === 'reach'
  if (!wasAirborne || landing.speed < LIGHT_LAND_SPEED) return { ...consumed, phase: 'ground', time: 0 }
  return { ...consumed, landWeight: landWeightFor(landing.speed, timings), phase: 'land', time: timings.touchdown }
}

function landingWindow(moving: boolean, timings: AirTimings): readonly [number, number] {
  return moving
    ? [timings.absorb, timings.absorb + LAND_FADE_SECONDS]
    : [timings.settle - LAND_FADE_SECONDS, timings.settle]
}

function advanced(state: AirState, input: AirInput, timings: AirTimings): AirState {
  const time = state.time + input.deltaSeconds
  if (state.phase === 'rise') {
    return time >= timings.riseDuration ? { ...state, phase: 'fall', time: time - timings.riseDuration } : { ...state, time }
  }
  if (state.phase === 'fall') return { ...state, time: timings.loopDuration > 0 ? time % timings.loopDuration : 0 }
  if (state.phase === 'land') {
    return time >= landingWindow(input.moving, timings)[1] ? { ...state, phase: 'ground', time: 0 } : { ...state, time }
  }
  return state
}

export function stepAir(state: AirState, input: AirInput, timings: AirTimings): AirState {
  const launched = afterReach(afterTakeoff(state, input, timings), input, timings)
  return advanced(afterLanding(launched, input, timings), input, timings)
}

export function airLayer(state: AirState, input: AirInput, timings: AirTimings): AirLayer | null {
  if (state.phase === 'rise') return { clip: 'jump-start', time: state.time, weight: 1 }
  if (state.phase === 'fall') return { clip: 'jump-loop', time: state.time, weight: 1 }
  if (state.phase === 'reach') return { clip: 'jump-land', time: timings.touchdown, weight: 1 }
  if (state.phase !== 'land') return null
  const [start, end] = landingWindow(input.moving, timings)
  return { clip: 'jump-land', time: state.time, weight: state.landWeight * (1 - smoothStep(start, end, state.time)) }
}
