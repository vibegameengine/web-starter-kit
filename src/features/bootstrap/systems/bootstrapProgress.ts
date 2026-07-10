export type BootstrapProgressPlan = {
  readonly assetsStart: number
  readonly assetsEnd: number
  readonly finalizeEnd: number
  readonly renderProgress: number
}

const PREPARE_BAND = 0.18
const ASSETS_END = 0.85
const FINALIZE_BAND = 0.07
const RENDER_PROGRESS = 0.96

type BootstrapProgressPhase = 'prepare' | 'assets' | 'finalize' | 'render'

/**
 * Builds progress bands that adapt to which optional stages exist, so the bar
 * never jumps to a large value on start when there are no prepare steps and
 * never leaves a dead gap at the end when there are no finalize steps.
 */
export function createBootstrapProgressPlan(options: {
  readonly hasPrepareSteps: boolean
  readonly hasFinalizeSteps: boolean
}): BootstrapProgressPlan {
  return {
    assetsStart: options.hasPrepareSteps ? PREPARE_BAND : 0,
    assetsEnd: ASSETS_END,
    finalizeEnd: options.hasFinalizeSteps ? ASSETS_END + FINALIZE_BAND : ASSETS_END,
    renderProgress: RENDER_PROGRESS,
  }
}

export function getBootstrapProgress(
  phase: BootstrapProgressPhase,
  stageFraction: number,
  plan: BootstrapProgressPlan,
): number {
  const fraction = clampUnit(stageFraction)

  switch (phase) {
    case 'prepare':
      return interpolate(0, plan.assetsStart, fraction)
    case 'assets':
      return interpolate(plan.assetsStart, plan.assetsEnd, fraction)
    case 'finalize':
      return interpolate(plan.assetsEnd, plan.finalizeEnd, fraction)
    case 'render':
      return plan.renderProgress
  }
}

/** Progress is monotonic: a later phase must never move the bar backwards. */
export function getNextBootstrapProgress(currentProgress: number, nextProgress: number): number {
  return Math.max(currentProgress, nextProgress)
}

function interpolate(start: number, end: number, fraction: number): number {
  // Return exact band boundaries so a completed stage lands precisely on its
  // edge instead of a floating-point neighbor (0.849999… vs 0.85).
  if (fraction <= 0) {
    return start
  }

  if (fraction >= 1) {
    return end
  }

  return start + (end - start) * fraction
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}
