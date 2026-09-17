import type { MotionState } from '../../features/motion/systems/motionController'

export type MotionReadout = {
  readonly height: number
  readonly locomotion: string
  readonly mode: string
  readonly speed: number
  readonly steppedUp: number
  readonly x: number
  readonly z: number
}

export const EMPTY_MOTION_READOUT: MotionReadout = {
  height: 0,
  locomotion: 'idle',
  mode: 'walking',
  speed: 0,
  steppedUp: 0,
  x: 0,
  z: 0,
}

export type MotionReadoutStore = {
  readonly getSnapshot: () => MotionReadout
  readonly publish: (state: MotionState) => void
  readonly subscribe: (listener: () => void) => () => void
}

export const MOTION_READOUT_INTERVAL_SECONDS = 0.1

export function createMotionReadoutStore(): MotionReadoutStore {
  let snapshot = EMPTY_MOTION_READOUT
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => snapshot,
    publish: (state) => {
      snapshot = {
        height: state.position[1],
        locomotion: state.locomotionDirection,
        mode: state.mode,
        speed: Math.hypot(state.velocity[0], state.velocity[2]),
        steppedUp: state.steppedUp,
        x: state.position[0],
        z: state.position[2],
      }
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
