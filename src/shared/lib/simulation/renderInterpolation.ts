/**
 * Rendering reads the simulation between fixed steps. Writing the simulated
 * transform straight into the scene at the simulation rate makes movement look
 * stepped on any display faster than the tick — GDD §6.6 requires interpolation.
 */

/** Fraction of the next step already elapsed, derived from the leftover accumulator. */
export function interpolationAlpha(accumulatorMs: number, stepHz: number): number {
  if (!(stepHz > 0)) return 0
  const stepMs = 1_000 / stepHz
  return Math.min(1, Math.max(0, accumulatorMs / stepMs))
}

export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

/** Interpolates yaw along the shortest arc so a turn never spins the long way. */
export function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * alpha
}
