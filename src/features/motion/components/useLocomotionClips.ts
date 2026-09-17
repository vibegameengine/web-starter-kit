import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import type { AnimationClip, Object3D } from 'three'

import { LOCOMOTION_CLIP_SOURCES } from '../catalog/locomotionClips'
import { clipToRigScale, scaleClipPositions } from '../systems/clipScale'
import type { LocomotionClipId } from '../systems/locomotionPose'
import { mirrorClip } from '../systems/mirrorClip'

export type LocomotionClips = Readonly<Record<LocomotionClipId, AnimationClip>>

const CLIP_IDS = Object.keys(LOCOMOTION_CLIP_SOURCES) as readonly LocomotionClipId[]

const CLIP_URLS = [...new Set(CLIP_IDS.map((id) => LOCOMOTION_CLIP_SOURCES[id].url))]

function sourceClip(loaded: readonly { animations: AnimationClip[] }[], url: string): AnimationClip {
  const index = CLIP_URLS.indexOf(url)
  const animations = loaded[index]?.animations
  if (!animations || animations.length !== 1) {
    throw new Error(`${url} must hold exactly one animation clip, found ${animations?.length ?? 0}`)
  }
  return animations[0]
}

export function useLocomotionClips(rig: Object3D): LocomotionClips {
  const loaded = useGLTF(CLIP_URLS) as unknown as readonly { animations: AnimationClip[] }[]

  return useMemo(() => {
    const clips = {} as Record<LocomotionClipId, AnimationClip>
    for (const id of CLIP_IDS) {
      const source = LOCOMOTION_CLIP_SOURCES[id]
      const base = sourceClip(loaded, source.url)
      const clip = source.mirrored ? mirrorClip(base, id) : base.clone()
      clip.name = id
      clips[id] = scaleClipPositions(clip, clipToRigScale(clip, rig))
    }
    return clips
  }, [loaded, rig])
}
