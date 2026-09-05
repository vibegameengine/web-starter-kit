import { useSyncExternalStore } from 'react'

import { setChannelVolume, setMasterVolume, setSoundMuted } from './soundMixer'
import type { SoundChannel } from './soundMixer'

/**
 * The player's audio settings — the thing that was missing between the mixer and
 * a settings screen.
 *
 * `soundMixer` has had `setMasterVolume` / `setChannelVolume` / `setSoundMuted`
 * from the start and nothing ever called them: the faders existed, but no value
 * was stored, persisted or surfaced. This is that half. Same shape as
 * `graphics/graphicsQuality.ts` deliberately — a tiny `useSyncExternalStore`
 * store over `localStorage` — so a volume set in the pause menu survives leaving
 * the arena and reloading the page, and a second settings surface later reads
 * the same store rather than inventing another one.
 *
 * The store is the source of truth and the mixer is its output: every write goes
 * through `apply`, so the two can never disagree.
 */

export type AudioSettings = {
  readonly master: number
  readonly music: number
  readonly sfx: number
  readonly muted: boolean
}

/**
 * Channels a player is offered. `ambient` and `ui` ride the master rather than
 * getting a fader of their own — a settings screen with five sliders is a
 * settings screen nobody finishes reading.
 */
const CHANNEL_KEYS = ['music', 'sfx'] as const satisfies readonly SoundChannel[]

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 1,
  music: 1,
  muted: false,
  sfx: 1,
}

const STORAGE_KEY = 'web-starter-kit:audio-settings:v1'

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

function readInitialSettings(): AudioSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_AUDIO_SETTINGS
    const parsed = JSON.parse(stored) as Partial<AudioSettings>
    return {
      master: clamp01(parsed.master ?? DEFAULT_AUDIO_SETTINGS.master),
      music: clamp01(parsed.music ?? DEFAULT_AUDIO_SETTINGS.music),
      muted: parsed.muted === true,
      sfx: clamp01(parsed.sfx ?? DEFAULT_AUDIO_SETTINGS.sfx),
    }
  } catch {
    // Unavailable (private mode) or corrupt (a hand-edited key): the defaults
    // are always playable, so a bad stored value must never be fatal.
    return DEFAULT_AUDIO_SETTINGS
  }
}

let current: AudioSettings = readInitialSettings()
const listeners = new Set<() => void>()

/** Pushes the stored values into the mixer. The only place that writes to it. */
function apply(settings: AudioSettings): void {
  setMasterVolume(settings.master)
  for (const channel of CHANNEL_KEYS) setChannelVolume(channel, settings[channel])
  setSoundMuted(settings.muted)
}

export function getAudioSettings(): AudioSettings {
  return current
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  const next: AudioSettings = {
    master: clamp01(patch.master ?? current.master),
    music: clamp01(patch.music ?? current.music),
    muted: patch.muted ?? current.muted,
    sfx: clamp01(patch.sfx ?? current.sfx),
  }
  if (
    next.master === current.master &&
    next.music === current.music &&
    next.sfx === current.sfx &&
    next.muted === current.muted
  ) {
    return
  }

  current = next
  apply(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Persistence is best-effort; the in-memory choice still drives this session.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Subscribes a component to the settings. Re-renders only when they change. */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribe, getAudioSettings, getAudioSettings)
}

/**
 * Pushes the stored settings into the mixer once at start-up.
 *
 * Needed because the mixer boots at unity gain and knows nothing about what the
 * player chose last session: without this, a muted game comes back loud.
 */
export function initAudioSettings(): void {
  apply(current)
}

/** Test seam: forget the stored settings and return the mixer to defaults. */
export function resetAudioSettingsForTests(): void {
  current = DEFAULT_AUDIO_SETTINGS
  apply(current)
}
