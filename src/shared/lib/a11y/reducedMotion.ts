/**
 * Reduced-motion preference probe. Feature-detected so it is inert in non-DOM
 * contexts (tests, SSR). Mirrors the CSS `@media (prefers-reduced-motion: reduce)`
 * guards: it is the single JS gate for optional, motion-adjacent effects — chiefly
 * haptic pulses, which are silenced whenever the user asks the OS to minimise
 * motion (i.e. haptics fire only under `prefers-reduced-motion: no-preference`).
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
