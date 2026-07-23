import { useEffect, useState } from 'react'

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
export function useResponsiveTargetWidth(options: ResponsiveTargetWidthOptions): number {
  const { desktop, mobilePortrait, phoneMaxWidth } = options
  const [targetWidth, setTargetWidth] = useState(() =>
    computeResponsiveTargetWidth({ desktop, mobilePortrait, phoneMaxWidth }),
  )

  useEffect(() => {
    const update = () =>
      setTargetWidth(computeResponsiveTargetWidth({ desktop, mobilePortrait, phoneMaxWidth }))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [desktop, mobilePortrait, phoneMaxWidth])

  return targetWidth
}
