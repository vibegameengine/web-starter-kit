import { prefersReducedMotion } from '../a11y/reducedMotion'

/** Best-effort touch feedback that respects the operating-system motion setting. */
export function triggerHaptic(durationMs = 8): void {
  if (prefersReducedMotion()) return
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(durationMs)
  }
}
