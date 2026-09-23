export type StandReadout = {
  readonly clip: string
  readonly contactLeft: number
  readonly contactRight: number
  readonly footLeftY: number
  readonly footRightY: number
  readonly frame: number
  readonly hipsY: number
  readonly lockedLeft: boolean
  readonly lockedRight: boolean
  readonly pelvisDrop: number
  readonly phase: number
  readonly speed: number
  readonly strideScale: number
  readonly travelled: number
}

export const EMPTY_STAND_READOUT: StandReadout = {
  clip: 'idle',
  contactLeft: 0,
  contactRight: 0,
  footLeftY: 0,
  footRightY: 0,
  frame: 0,
  hipsY: 0,
  lockedLeft: false,
  lockedRight: false,
  pelvisDrop: 0,
  phase: 0,
  speed: 0,
  strideScale: 1,
  travelled: 0,
}

export type StandStore = {
  readonly getSnapshot: () => StandReadout
  readonly publish: (readout: StandReadout) => void
  readonly subscribe: (listener: () => void) => () => void
}

export const MOTION_STAND_STEP_EVENT = 'motion-stand-step'

export const MOTION_STAND_RESET_EVENT = 'motion-stand-reset'

export const MOTION_STAND_JUMP_EVENT = 'motion-stand-jump'

export function createStandStore(): StandStore {
  let snapshot = EMPTY_STAND_READOUT
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
