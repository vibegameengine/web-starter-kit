/* eslint-disable react-hooks/immutability -- action weights and times are
   three's own imperative state, set per frame and never read during render. */
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer } from 'three'
import type { AnimationAction, Object3D } from 'three'

import type { LocomotionClipId } from '../systems/locomotionPose'
import { useLocomotionClips, type LocomotionClips } from './useLocomotionClips'

export type PosePlayhead = {
  clipId: LocomotionClipId
  time: number
}

export type BlendEntry = {
  readonly clipId: LocomotionClipId
  readonly phase: number
  readonly weight: number
}

export type PoseCrossfade = {
  readonly advance: (deltaSeconds: number, rate: number) => void
  readonly atPhase: (clipId: LocomotionClipId, phase: number, deltaSeconds: number) => void
  readonly blendAtPhase: (entries: readonly BlendEntry[]) => void
  readonly blend: () => number
  readonly durationOf: (clipId: LocomotionClipId) => number
  readonly playing: () => PosePlayhead
  readonly playIdle: (clock: number) => void
  readonly switchTo: (playhead: PosePlayhead) => void
}

export const CROSSFADE_SECONDS = 0.18

const IDLE_CLIP: LocomotionClipId = 'idle'

function buildActions(mixer: AnimationMixer, clips: LocomotionClips): Map<LocomotionClipId, AnimationAction> {
  const built = new Map<LocomotionClipId, AnimationAction>()
  for (const [id, clip] of Object.entries(clips) as readonly [LocomotionClipId, LocomotionClips[LocomotionClipId]][]) {
    const action = mixer.clipAction(clip)
    action.enabled = true
    action.setEffectiveWeight(0)
    action.play()
    built.set(id, action)
  }
  return built
}

function wrapped(time: number, duration: number): number {
  if (duration <= 0) return 0
  const wrappedTime = time % duration
  return wrappedTime < 0 ? wrappedTime + duration : wrappedTime
}

export function usePoseCrossfade(rig: Object3D): PoseCrossfade {
  const clips = useLocomotionClips(rig)
  const mixer = useMemo(() => new AnimationMixer(rig), [rig])
  const actions = useMemo(() => buildActions(mixer, clips), [clips, mixer])
  const playing = useRef<PosePlayhead>({ clipId: 'walk-forward', time: 0 })
  const fading = useRef<{ from: PosePlayhead; share: number } | null>(null)

  useEffect(() => () => {
    mixer.stopAllAction()
  }, [mixer])

  const durationOf = (clipId: LocomotionClipId) => actions.get(clipId)?.getClip().duration ?? 0

  const applyWeights = () => {
    const fade = fading.current
    for (const [id, action] of actions) {
      let weight = 0
      if (id === playing.current.clipId) weight = fade ? fade.share : 1
      if (fade && id === fade.from.clipId) weight += 1 - fade.share
      action.setEffectiveWeight(weight)
      if (id === playing.current.clipId) action.time = playing.current.time
      if (fade && id === fade.from.clipId) action.time = fade.from.time
    }
    mixer.update(0)
  }

  return {
    blendAtPhase: (entries) => {
      fading.current = null
      const leading = entries.reduce((best, entry) => (entry.weight > best.weight ? entry : best), entries[0])
      playing.current = { clipId: leading.clipId, time: leading.phase * durationOf(leading.clipId) }
      for (const [id, action] of actions) {
        const entry = entries.find((candidate) => candidate.clipId === id)
        action.setEffectiveWeight(entry ? entry.weight : 0)
        if (entry) action.time = entry.phase * durationOf(id)
      }
      mixer.update(0)
    },
    atPhase: (clipId, phase, deltaSeconds) => {
      const wrappedPhase = phase - Math.floor(phase)
      if (clipId !== playing.current.clipId) {
        fading.current = { from: { ...playing.current }, share: 0 }
        playing.current = { clipId, time: wrappedPhase * durationOf(clipId) }
      } else {
        playing.current.time = wrappedPhase * durationOf(clipId)
      }
      const fade = fading.current
      if (fade) {
        fade.from.time = wrappedPhase * durationOf(fade.from.clipId)
        fade.share = Math.min(1, fade.share + deltaSeconds / CROSSFADE_SECONDS)
        if (fade.share >= 1) fading.current = null
      }
      applyWeights()
    },
    advance: (deltaSeconds, rate) => {
      playing.current.time = wrapped(playing.current.time + deltaSeconds * rate, durationOf(playing.current.clipId))
      const fade = fading.current
      if (fade) {
        fade.from.time = wrapped(fade.from.time + deltaSeconds * rate, durationOf(fade.from.clipId))
        fade.share = Math.min(1, fade.share + deltaSeconds / CROSSFADE_SECONDS)
        if (fade.share >= 1) fading.current = null
      }
      applyWeights()
    },
    blend: () => fading.current?.share ?? 1,
    durationOf,
    playIdle: (clock) => {
      fading.current = null
      playing.current = { clipId: IDLE_CLIP, time: wrapped(clock, durationOf(IDLE_CLIP)) }
      applyWeights()
    },
    playing: () => playing.current,
    switchTo: (playhead) => {
      if (playhead.clipId === playing.current.clipId && Math.abs(playhead.time - playing.current.time) < 1e-3) return
      fading.current = { from: { ...playing.current }, share: 0 }
      playing.current = { ...playhead }
    },
  }
}
