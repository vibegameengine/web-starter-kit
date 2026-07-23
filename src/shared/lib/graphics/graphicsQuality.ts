import { useSyncExternalStore } from 'react'

import {
  DEFAULT_GRAPHICS_QUALITY,
  GRAPHICS_PRESETS,
  type GraphicsPreset,
  type GraphicsQuality,
} from '../../config/graphicsPresets'

/**
 * App-wide graphics quality — the single source of truth for the chosen render
 * tier. Mirrors the locale store (`shared/lib/localization/appLocale.ts`): a tiny
 * `useSyncExternalStore` store that persists to `localStorage` and notifies
 * subscribers, so a tier picked in the main-menu settings survives navigation
 * into the game and a full page reload.
 *
 * The game canvases read `useGraphicsSettings()` at mount, so switching tiers in
 * the menu takes effect the next time a scene mounts (which is always after the
 * menu). There's no live in-scene switch to worry about.
 */
const STORAGE_KEY = 'web-starter-kit:graphics-quality:v1'

function isGraphicsQuality(value: string | null | undefined): value is GraphicsQuality {
  return value === 'performance' || value === 'economy'
}

function readInitialQuality(): GraphicsQuality {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isGraphicsQuality(stored)) {
      return stored
    }
  } catch {
    // localStorage may be unavailable (private mode / SSR) — fall back to the default tier.
  }

  return DEFAULT_GRAPHICS_QUALITY
}

let currentQuality: GraphicsQuality = readInitialQuality()
const listeners = new Set<() => void>()

function getGraphicsQuality(): GraphicsQuality {
  return currentQuality
}

export function setGraphicsQuality(next: GraphicsQuality): void {
  if (next === currentQuality) {
    return
  }

  currentQuality = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
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

/** Reactive chosen quality tier; re-renders the caller when it changes. */
export function useGraphicsQuality(): GraphicsQuality {
  return useSyncExternalStore(subscribe, getGraphicsQuality, getGraphicsQuality)
}

/** The resolved render knobs for the currently chosen tier. */
export function useGraphicsSettings(): GraphicsPreset {
  return GRAPHICS_PRESETS[useGraphicsQuality()]
}
