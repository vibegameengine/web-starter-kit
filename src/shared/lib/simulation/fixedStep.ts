export type FixedStepState = {
  accumulatorMs: number
  frozen: boolean
  freezeReason: 'hidden' | 'drift' | null
}

export type FixedStepAdvance = {
  droppedMs: number
  state: FixedStepState
  steps: number
}

export type FixedStepOptions = {
  readonly maxCatchUpSteps?: number
  readonly stepHz: number
  readonly driftFreezeMs?: number
}

/** Creates state for a deterministic simulation clock, independent from render FPS. */
export function createFixedStepState(): FixedStepState {
  return { accumulatorMs: 0, frozen: false, freezeReason: null }
}

/**
 * Accumulates elapsed wall time into fixed simulation steps. A hidden tab or a
 * long scheduling stall freezes the clock instead of making the simulation jump.
 */
export function advanceFixedStep(
  current: Readonly<FixedStepState>,
  elapsedMs: number,
  { stepHz, maxCatchUpSteps = 4, driftFreezeMs = 300 }: FixedStepOptions,
  documentHidden = false,
): FixedStepAdvance {
  if (current.frozen) return { state: { ...current }, steps: 0, droppedMs: 0 }
  if (documentHidden || elapsedMs > driftFreezeMs) {
    return {
      state: { accumulatorMs: current.accumulatorMs, frozen: true, freezeReason: documentHidden ? 'hidden' : 'drift' },
      steps: 0,
      droppedMs: 0,
    }
  }

  const stepMs = 1_000 / stepHz
  const availableMs = current.accumulatorMs + Math.max(0, elapsedMs)
  const requestedSteps = Math.floor((availableMs * stepHz + 1e-9) / 1_000)
  const steps = Math.min(requestedSteps, maxCatchUpSteps)
  const droppedMs = Math.max(0, requestedSteps - maxCatchUpSteps) * stepMs

  return {
    state: { accumulatorMs: availableMs - steps * stepMs - droppedMs, frozen: false, freezeReason: null },
    steps,
    droppedMs,
  }
}
