import { useSyncExternalStore } from 'react'

import { DEFAULT_FRAME_RATE_CAP, type FrameRateCap } from '../../config/graphicsPresets'

/**
 * App-wide frame-rate cap — the chosen FPS ceiling, persisted like the graphics
 * tier (see [[graphics-quality-presets]] / `graphicsQuality.ts`). `0` means
 * unlimited. The game canvases pass this straight to `<Canvas maxFps>`, a NATIVE
 * cap added in our vendored R3F fork (`shared/vendor/react-three-fiber`) that
 * throttles R3F's own render loop — no demand-mode / manual driver.
 */
const STORAGE_KEY = 'web-starter-kit:frame-cap:v1'

function isFrameRateCap(value: number): value is FrameRateCap {
  return value === 0 || value === 30 || value === 45 || value === 60
}

function readInitialCap(): FrameRateCap {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(stored) && isFrameRateCap(stored)) {
      return stored
    }
  } catch {
    // localStorage may be unavailable (private mode / SSR) — fall back to unlimited.
  }

  return DEFAULT_FRAME_RATE_CAP
}

let currentCap: FrameRateCap = readInitialCap()
const listeners = new Set<() => void>()

function getFrameRateCap(): FrameRateCap {
  return currentCap
}

export function setFrameRateCap(next: FrameRateCap): void {
  if (next === currentCap) {
    return
  }

  currentCap = next
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next))
  } catch {
    // Persistence is best-effort; the in-memory choice still drives this session.
  }

  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Reactive chosen FPS cap (`0` = unlimited); re-renders the caller when it changes. */
export function useFrameRateCap(): FrameRateCap {
  return useSyncExternalStore(subscribe, getFrameRateCap, getFrameRateCap)
}
