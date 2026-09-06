import { useCallback, useSyncExternalStore } from 'react'

export type ResponsiveTargetWidthOptions = {
  /** Logical design width used on desktop / wide viewports. */
  readonly desktop: number
  /**
   * Logical design width used on a narrow portrait phone. `ScalableContainer`
   * shrinks the logical canvas down to fit the real width, so a desktop-width
   * target collapses the UI into a tiny centred island on a phone. A smaller
   * target keeps the on-screen scale near 1, so the UI fills the screen and stays
   * legible — no compensating per-element `scale()` hacks needed.
   */
  readonly mobilePortrait: number
  /** Max viewport width (px) still treated as a phone. Default 720. */
  readonly phoneMaxWidth?: number
}

/**
 * Pick the logical `targetWidth` for `ScalableContainer` from the current viewport:
 * a narrow portrait phone gets the smaller `mobilePortrait` width; everything else
 * keeps the wide `desktop` design width.
 */
export function computeResponsiveTargetWidth({
  desktop,
  mobilePortrait,
  phoneMaxWidth = 720,
}: ResponsiveTargetWidthOptions): number {
  if (typeof window === 'undefined') return desktop
  const portrait = window.innerHeight >= window.innerWidth
  if (portrait && window.innerWidth <= phoneMaxWidth) return mobilePortrait
  return desktop
}

/**
 * Reactive `computeResponsiveTargetWidth`: recomputes on resize and orientation
 * change so rotating the device or resizing the window re-targets the scaler.
 */
function subscribeToViewport(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  window.addEventListener('orientationchange', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    window.removeEventListener('orientationchange', onChange)
  }
}

export function useResponsiveTargetWidth(options: ResponsiveTargetWidthOptions): number {
  const { desktop, mobilePortrait, phoneMaxWidth } = options
  const read = useCallback(
    () => computeResponsiveTargetWidth({ desktop, mobilePortrait, phoneMaxWidth }),
    [desktop, mobilePortrait, phoneMaxWidth],
  )
  return useSyncExternalStore(subscribeToViewport, read, () => desktop)
}
