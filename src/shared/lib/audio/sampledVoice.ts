import { Howl } from 'howler'

import { decibelsToGain, getChannelGain } from './soundMixer'
import { createOneShotPool } from './oneShotPool'
import type { OneShotPoolConfig } from './oneShotPool'

/**
 * A pool of recorded one-shots that plays one, never the same twice running,
 * detuned and re-levelled a little each time.
 *
 * This is the shared half of every sampled sound in the game — the gun, the
 * feet, whatever comes next — because two things about it are easy to get wrong
 * and expensive to get wrong twice:
 *
 * 1. **Volume and rate go on the VOICE, not on the Howl.** These sounds overlap
 *    (footfalls at a run, a rack over a ringing shot), and setting either on the
 *    Howl retunes whatever is still sounding.
 * 2. **A clip that has not finished loading must be SKIPPED, not queued.** This
 *    was a real, measured bug: `preload: true` only starts the fetch, and a
 *    scene that mounts fourteen of these can easily fire the first shot while
 *    one clip is still in flight. Howler's answer is to queue the play and run
 *    it on load — which lands the rack a second or more after the shot it
 *    belonged to. A missing variant is inaudible; a late one is a mistake you
 *    can hear.
 */

export type SampledVoiceConfig = {
  readonly urls: readonly string[]
  /** Nominal level, dBFS, before channel gain and the per-play jitter. */
  readonly decibels: number
  readonly pool: Omit<OneShotPoolConfig, 'variantCount'>
}

export type SampledVoice = {
  /**
   * Plays one variant. `rateScale` multiplies the randomised rate — use it for a
   * heavier or lighter reading of the same set (a landing against a footstep).
   * Returns whether a voice actually started.
   */
  readonly play: (rateScale?: number) => boolean
  /** How many variants the set ships. */
  readonly variantCount: number
  readonly dispose: () => void
}

export function createSampledVoice(config: SampledVoiceConfig): SampledVoice {
  const howls = config.urls.map((url) => new Howl({ preload: true, src: [url] }))
  const pool = createOneShotPool({ ...config.pool, variantCount: howls.length })

  return {
    play(rateScale = 1) {
      // Walk the pool rather than taking its first answer: asking once and
      // giving up would silence the whole set whenever the one variant it named
      // happened to be the clip still loading.
      for (let attempt = 0; attempt < howls.length; attempt += 1) {
        const variation = pool.next()
        const howl = howls[variation.index]
        if (!howl || howl.state() !== 'loaded') continue
        const id = howl.play()
        howl.volume(decibelsToGain(config.decibels) * getChannelGain('sfx') * variation.volume, id)
        howl.rate(variation.rate * rateScale, id)
        return true
      }
      return false
    },
    variantCount: howls.length,
    dispose() {
      for (const howl of howls) howl.unload()
    },
  }
}
