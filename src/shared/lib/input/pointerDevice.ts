import { useEffect, useState } from 'react'

const COARSE_QUERY = '(pointer: coarse)'

/**
 * Manual scheme override for testing on the wrong device: `?touch=1` forces the
 * twin-stick scheme on, `?touch=0` forces it off. Returns null when unset so the
 * device auto-detect wins (the shipped default).
 */
function touchSchemeOverride(): boolean | null {
  if (typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('touch')
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

/**
 * True when the primary pointer is coarse (touch). Reads `matchMedia` first — the
 * standards-track signal — and falls back to `maxTouchPoints` for engines that do
 * not report the media feature. Pure aside from the two browser globals, and safe
 * to call in SSR/non-DOM contexts (returns `false`).
 *
 * Touch → the on-screen twin-stick scheme; a mouse → the Diablo click/keyboard
 * scheme. This is the ONLY switch that selects a control scheme (per product
 * decision: auto by device, no manual toggle).
 */
export function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function' && window.matchMedia(COARSE_QUERY).matches) {
    return true
  }
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
}

/**
 * Reactive coarse-pointer flag. Re-evaluates when the `(pointer: coarse)` media
 * query flips — e.g. a 2-in-1 detaching its keyboard, or a desktop devtools device
 * emulation toggling — so the scheme follows the live device without a reload.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => touchSchemeOverride() ?? isCoarsePointerDevice())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(COARSE_QUERY)
    const update = () => setCoarse(touchSchemeOverride() ?? isCoarsePointerDevice())
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return coarse
}
