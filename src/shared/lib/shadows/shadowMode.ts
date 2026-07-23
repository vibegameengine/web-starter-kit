import { useSyncExternalStore } from 'react'

/** Persisted player-facing shadow choice. `?shadows=` remains a DEV-only override. */
export type ShadowMode = 'legacy' | 'cached'

const STORAGE_KEY = 'web-starter-kit:shadow-mode:v1'

export function normalizeShadowMode(value: string | null | undefined): ShadowMode {
  return value === 'cached' ? 'cached' : 'legacy'
}

function readDevOverride(): ShadowMode | null {
  if (!import.meta.env.DEV) return null
  const value = new URLSearchParams(window.location.search).get('shadows')
  return value === 'cached' || value === 'legacy' ? value : null
}

function readInitialShadowMode(): ShadowMode {
  try {
    return normalizeShadowMode(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'legacy'
  }
}

let selectedShadowMode = readInitialShadowMode()
const listeners = new Set<() => void>()

/** Active mode, including the non-persistent DEV query override when present. */
export function activeShadowMode(): ShadowMode {
  return readDevOverride() ?? selectedShadowMode
}

export function setShadowMode(next: ShadowMode): void {
  if (next === selectedShadowMode) return
  selectedShadowMode = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Persistence is best-effort; the current session still honours the choice.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive active mode for canvases and settings UI. */
export function useShadowMode(): ShadowMode {
  return useSyncExternalStore(subscribe, activeShadowMode, activeShadowMode)
}

export function useCachedShadowsEnabled(): boolean {
  return useShadowMode() === 'cached'
}
