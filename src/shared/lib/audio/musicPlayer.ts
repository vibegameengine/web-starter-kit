import { Howl } from 'howler'

import { decibelsToGain, getChannelGain, warmSoundMixer } from './soundMixer'
import { advancePlaylist, createPlaylistState } from './playlistOrder'
import type { PlaylistState } from './playlistOrder'

/**
 * The score: one track at a time, crossfaded into the next when it ends.
 *
 * This is the music half of the same audio layer `sampledVoice` is the one-shot
 * half of — same factory shape, same mixer, same dB → gain conversion. It is a
 * player, not an engine: it holds no routing of its own and asks
 * `soundMixer` for its channel gain like everything else does.
 *
 * Two decisions that are not stylistic:
 *
 * 1. **`html5: true`.** Howler's default decodes the whole file into an
 *    AudioBuffer. These tracks are two minutes of 44.1 kHz stereo, which is
 *    ~128 MB of PCM for three of them — for music that is played start to
 *    finish and never needs sample-accurate scheduling. HTML5 audio streams it
 *    instead.
 * 2. **Only the CURRENT track is loaded.** A playlist that constructs every
 *    `Howl` up front starts three downloads on mount and holds them for the
 *    session. The next one is created when the last one ends, and the previous
 *    is unloaded once it has faded out.
 */

export type MusicTrack = {
  /** Shown by a HUD or a bench; never parsed. */
  readonly title: string
  readonly url: string
}

export type MusicPlayerConfig = {
  /**
   * The tracks, in their natural order. Shuffling is the player's business, not
   * the caller's — see `playlistOrder`.
   */
  readonly tracks: readonly MusicTrack[]
  /** Nominal level, dBFS, before the music channel gain. */
  readonly decibels: number
  /** Crossfade length at a track change, seconds. */
  readonly fadeSeconds: number
  readonly shuffle: boolean
  /** Called whenever a different track takes over. */
  readonly onTrackChange?: (track: MusicTrack, index: number) => void
}

export type MusicPlayer = {
  /** Starts the score, or resumes it after `pause`. Safe to call repeatedly. */
  readonly play: () => void
  /** Stops without forgetting the playlist position. */
  readonly pause: () => void
  /** Fades the current track out and brings the next one in immediately. */
  readonly skip: () => void
  readonly isPlaying: () => boolean
  /** The track sounding now, or `null` before the first `play`. */
  readonly currentTrack: () => MusicTrack | null
  /** Re-reads the mixer, for when a settings fader moves mid-track. */
  readonly refreshVolume: () => void
  readonly dispose: () => void
}

export function createMusicPlayer(config: MusicPlayerConfig): MusicPlayer {
  let playlist: PlaylistState = createPlaylistState(config.tracks.length, config.shuffle)
  let howl: Howl | null = null
  let currentIndex: number | null = null
  let disposed = false
  let wantsToPlay = false
  /**
   * Consecutive tracks that failed to load or play. Without this, a playlist of
   * broken URLs recurses through itself forever at load-error speed; with it,
   * one full pass over the list gives up quietly.
   */
  let failures = 0

  const targetVolume = () => decibelsToGain(config.decibels) * getChannelGain('music')

  const retire = (retiring: Howl) => {
    // Its own `end` must not advance the playlist a second time while it fades.
    retiring.off()
    const fadeMs = Math.max(1, config.fadeSeconds * 1000)
    retiring.once('fade', () => retiring.unload())
    retiring.fade(retiring.volume(), 0, fadeMs)
  }

  const advance = () => {
    if (disposed || !wantsToPlay) return
    const step = advancePlaylist(playlist)
    playlist = step.state
    if (step.trackIndex === null) return

    const track = config.tracks[step.trackIndex]
    if (!track) return

    const previous = howl
    const next = new Howl({ html5: true, src: [track.url], volume: 0 })
    howl = next
    currentIndex = step.trackIndex

    const onFailure = () => {
      failures += 1
      if (failures >= config.tracks.length) return
      advance()
    }
    next.once('end', () => {
      failures = 0
      advance()
    })
    next.once('loaderror', onFailure)
    next.once('playerror', onFailure)

    const id = next.play()
    next.fade(0, targetVolume(), Math.max(1, config.fadeSeconds * 1000), id)
    if (previous) retire(previous)
    config.onTrackChange?.(track, step.trackIndex)
  }

  return {
    play() {
      if (disposed) return
      warmSoundMixer()
      if (wantsToPlay && howl?.playing()) return
      wantsToPlay = true
      failures = 0
      // Resume the track that was paused rather than burning a playlist slot.
      if (howl && !howl.playing()) {
        const id = howl.play()
        howl.fade(howl.volume(), targetVolume(), Math.max(1, config.fadeSeconds * 1000), id)
        return
      }
      advance()
    },
    pause() {
      wantsToPlay = false
      howl?.pause()
    },
    skip() {
      if (disposed || !wantsToPlay) return
      failures = 0
      advance()
    },
    isPlaying() {
      return Boolean(howl?.playing())
    },
    currentTrack() {
      return currentIndex === null ? null : (config.tracks[currentIndex] ?? null)
    },
    refreshVolume() {
      howl?.volume(targetVolume())
    },
    dispose() {
      disposed = true
      wantsToPlay = false
      howl?.off()
      howl?.unload()
      howl = null
    },
  }
}
