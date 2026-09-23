import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import type { AnimationClip, Object3D } from 'three'

import metrics from '../assets/animations/retargetedClipMetrics.json'
import { LOCOMOTION_CLIP_SOURCES } from '../catalog/locomotionClips'
import { RETARGETED_CLIP_IDS, RETARGETED_CLIP_SOURCES, type RetargetedClipId } from '../catalog/retargetedClips'
import type { AirTimings } from '../systems/airborne'
import { hipsRestHeight, scaleClipPositions, unitScaleFor } from '../systems/clipScale'

export type RetargetedClips = Readonly<Record<RetargetedClipId, AnimationClip>>

type ClipTimings = {
  readonly absorb: number | null
  readonly settle: number | null
  readonly takeoff: number | null
  readonly touchdown: number | null
}

const MEASURED = metrics as unknown as Readonly<Record<RetargetedClipId, ClipTimings>>
const URLS = RETARGETED_CLIP_IDS.map((id) => RETARGETED_CLIP_SOURCES[id].url)

function measured(id: RetargetedClipId, key: keyof ClipTimings): number {
  const value = MEASURED[id]?.[key]
  if (value === null || value === undefined) {
    throw new Error(`retargetedClipMetrics.json has no ${key} for ${id} — run node scripts/retarget-animations.mjs`)
  }
  return value
}

/* @important The retargeted clips are written in the locomotion clips' units by
   the pipeline, so they take the same one scale from the same idle clip. */
export function useRetargetedClips(rig: Object3D): RetargetedClips {
  const loaded = useGLTF(URLS) as unknown as readonly { animations: AnimationClip[] }[]
  const idle = useGLTF(LOCOMOTION_CLIP_SOURCES.idle.url) as unknown as { animations: AnimationClip[] }
  return useMemo(() => {
    const scale = unitScaleFor(idle.animations[0], hipsRestHeight(rig))
    const clips = {} as Record<RetargetedClipId, AnimationClip>
    RETARGETED_CLIP_IDS.forEach((id, index) => {
      const clip = loaded[index].animations[0].clone()
      clip.name = id
      clips[id] = scaleClipPositions(clip, scale)
    })
    return clips
  }, [idle, loaded, rig])
}

export function airTimingsOf(clips: RetargetedClips, jumpSpeed: number): AirTimings {
  return {
    absorb: measured('jump-land', 'absorb'),
    jumpSpeed,
    loopDuration: clips['jump-loop'].duration,
    riseDuration: clips['jump-start'].duration,
    settle: measured('jump-land', 'settle'),
    takeoff: measured('jump-start', 'takeoff'),
    touchdown: measured('jump-land', 'touchdown'),
  }
}
