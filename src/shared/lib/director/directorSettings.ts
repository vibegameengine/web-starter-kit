import { useSyncExternalStore } from 'react'

import { isCineCameraKey, type CineCameraKey } from './cineCamera'
import { anglesFromOffset } from './lightGeometry'

export type OutputTransform = 'aces' | 'agx' | 'linear' | 'neutral'

export const OUTPUT_TRANSFORMS: readonly OutputTransform[] = ['aces', 'neutral', 'agx', 'linear']

export type CameraChoice = CineCameraKey | 'scene'

export type DirectorSettings = {
  readonly ambient: {
    readonly environmentIntensity: number
    readonly fillColor: string
    readonly fillIntensity: number
    readonly groundColor: string
    readonly hemisphereIntensity: number
    readonly indirectChroma: number
    readonly indirectEV: number
    readonly rimIntensity: number
    readonly skyColor: string
  }
  readonly camera: {
    readonly focalMm: number
    readonly preset: CameraChoice
  }
  readonly look: {
    readonly balanceBlueStops: number
    readonly balanceGreenStops: number
    readonly balanceRedStops: number
    readonly contrast: number
    readonly exposureEV: number
    readonly grain: number
    readonly output: OutputTransform
    readonly saturation: number
    readonly shadowLiftEV: number
  }
  readonly post: {
    readonly displayContrast: number
    readonly glareIntensity: number
    readonly glareThreshold: number
    readonly vignetteDarkness: number
  }
  readonly sun: {
    readonly azimuthDeg: number
    readonly color: string
    readonly elevationDeg: number
    readonly intensity: number
  }
}

export type DirectorSection = keyof DirectorSettings

const KIT_SUN_OFFSET: [number, number, number] = [40, 52, 34]
export const KIT_SUN_DISTANCE = anglesFromOffset(KIT_SUN_OFFSET).distance
const KIT_SUN_ANGLES = anglesFromOffset(KIT_SUN_OFFSET)

export const DEFAULT_DIRECTOR_SETTINGS: DirectorSettings = {
  ambient: {
    environmentIntensity: 1,
    fillColor: '#bcd2ec',
    fillIntensity: 0.35,
    groundColor: '#b8a99a',
    hemisphereIntensity: 0.55,
    indirectChroma: 1,
    indirectEV: 0,
    rimIntensity: 0.8,
    skyColor: '#8bb4ef',
  },
  camera: { focalMm: 32, preset: 'scene' },
  look: {
    balanceBlueStops: 0,
    balanceGreenStops: 0,
    balanceRedStops: 0,
    contrast: 1,
    exposureEV: 0,
    grain: 0,
    output: 'aces',
    saturation: 1,
    shadowLiftEV: 0,
  },
  post: { displayContrast: 0.14, glareIntensity: 0.5, glareThreshold: 0.8, vignetteDarkness: 0.4 },
  sun: {
    azimuthDeg: KIT_SUN_ANGLES.azimuthDeg,
    color: '#ffe7c2',
    elevationDeg: KIT_SUN_ANGLES.elevationDeg,
    intensity: 2.8,
  },
}

const STORAGE_KEY = 'web-starter-kit:director:v1'

const ENUM_GUARDS: Record<string, (value: string) => boolean> = {
  output: (value) => (OUTPUT_TRANSFORMS as readonly string[]).includes(value),
  preset: (value) => value === 'scene' || isCineCameraKey(value),
}

function acceptsValue(key: string, fallback: unknown, value: unknown): boolean {
  if (typeof value !== typeof fallback) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string' && key in ENUM_GUARDS) return ENUM_GUARDS[key](value)
  return true
}

function mergeSection<T extends object>(fallback: T, stored: unknown): T {
  if (typeof stored !== 'object' || stored === null) return fallback
  const merged = { ...fallback } as Record<string, unknown>
  for (const [key, value] of Object.entries(stored)) {
    if (key in fallback && acceptsValue(key, merged[key], value)) merged[key] = value
  }
  return merged as T
}

export function sanitizeDirectorSettings(stored: unknown): DirectorSettings {
  const source = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  return {
    ambient: mergeSection(DEFAULT_DIRECTOR_SETTINGS.ambient, source.ambient),
    camera: mergeSection(DEFAULT_DIRECTOR_SETTINGS.camera, source.camera),
    look: mergeSection(DEFAULT_DIRECTOR_SETTINGS.look, source.look),
    post: mergeSection(DEFAULT_DIRECTOR_SETTINGS.post, source.post),
    sun: mergeSection(DEFAULT_DIRECTOR_SETTINGS.sun, source.sun),
  }
}

function readStoredSettings(): DirectorSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? DEFAULT_DIRECTOR_SETTINGS : sanitizeDirectorSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_DIRECTOR_SETTINGS
  }
}

let current = readStoredSettings()
const listeners = new Set<() => void>()

function persist(next: DirectorSettings): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

function publish(next: DirectorSettings): void {
  current = next
  persist(next)
  for (const listener of listeners) listener()
}

export function directorSettings(): DirectorSettings {
  return current
}

export function patchDirector<K extends DirectorSection>(section: K, patch: Partial<DirectorSettings[K]>): void {
  publish({ ...current, [section]: { ...current[section], ...patch } })
}

export function resetDirector(): void {
  publish(DEFAULT_DIRECTOR_SETTINGS)
}

function subscribeDirector(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useDirectorSettings(): DirectorSettings {
  return useSyncExternalStore(subscribeDirector, directorSettings, directorSettings)
}

export function useDirectorSection<K extends DirectorSection>(section: K): DirectorSettings[K] {
  const read = () => current[section]
  return useSyncExternalStore(subscribeDirector, read, read)
}
