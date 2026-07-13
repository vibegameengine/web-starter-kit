import { Howler } from 'howler'

/**
 * The game's master sound mixer (framework-free "system"). A single master bus
 * over Howler plus a handful of named sub-channels (sfx, ambient, ui) each with
 * its own linear gain, so a sound's final volume is `sound_dB → gain × channel ×
 * master`. Individual sounds (footsteps, spells, …) own their own `Howl` and ask
 * the mixer for their channel's gain — the mixer never holds the clips, only the
 * routing. Modelled on cozy-solitaire's audio systems (Howler global mute + a
 * per-sound dB → gain map), generalized here into real channels.
 *
 * There is no settings UI yet, so the mixer boots enabled at unity gain; wire a
 * settings store to `setMuted` / `setChannelVolume` when one exists.
 */

export type SoundChannel = 'sfx' | 'ambient' | 'ui'

const channelGain: Record<SoundChannel, number> = {
  sfx: 1,
  ambient: 1,
  ui: 1,
}

let isMuted = false
let masterGain = 1

/**
 * Nudge Howler's AudioContext toward a running state. Browsers only start it
 * inside a user gesture; call this from an interaction handler (or just early —
 * Howler also auto-resumes on the first gesture) so the first footstep isn't
 * swallowed by a suspended context.
 */
export function warmSoundMixer(): void {
  const ctx = Howler.ctx
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume()
  }
}

/** Master mute (mixes down the whole game). */
export function setSoundMuted(muted: boolean): void {
  isMuted = muted
  Howler.mute(muted)
}

/** 0..1 master fader. */
export function setMasterVolume(gain: number): void {
  masterGain = clamp01(gain)
  Howler.volume(masterGain)
}

/** 0..1 fader for one sub-channel; multiplied into every sound on that channel. */
export function setChannelVolume(channel: SoundChannel, gain: number): void {
  channelGain[channel] = clamp01(gain)
}

/**
 * The linear gain a sound on `channel` should multiply its own per-sound volume
 * by. Master mute is handled globally by Howler, so this excludes it — a muted
 * mixer still reports the channel gain (Howler silences the output).
 */
export function getChannelGain(channel: SoundChannel): number {
  return channelGain[channel]
}

export function isSoundMuted(): boolean {
  return isMuted
}

/** dBFS → linear gain (−6 dB ≈ half as loud). The one place we convert. */
export function decibelsToGain(decibels: number): number {
  return 10 ** (decibels / 20)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Test seam: restore mixer defaults between specs. */
export function resetSoundMixerForTests(): void {
  isMuted = false
  masterGain = 1
  channelGain.sfx = 1
  channelGain.ambient = 1
  channelGain.ui = 1
  Howler.mute(false)
  Howler.volume(1)
}
