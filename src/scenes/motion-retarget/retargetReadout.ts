export type RetargetReadout = {
  readonly duration: number
  readonly sourcePelvis: number
  readonly targetPelvis: number
  readonly time: number
  readonly worstLimb: string
  readonly worstLimbDegrees: number
}

export type RetargetStore = {
  readonly getSnapshot: () => RetargetReadout
  readonly publish: (readout: RetargetReadout) => void
  readonly subscribe: (listener: () => void) => () => void
}

export const MOTION_RETARGET_STEP_EVENT = 'motion-retarget-step'

export const RETARGET_STEP_SECONDS = 1 / 30

const EMPTY: RetargetReadout = { duration: 0, sourcePelvis: 0, targetPelvis: 0, time: 0, worstLimb: '-', worstLimbDegrees: 0 }

export function createRetargetStore(): RetargetStore {
  let snapshot = EMPTY
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    publish: (readout) => {
      snapshot = readout
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
