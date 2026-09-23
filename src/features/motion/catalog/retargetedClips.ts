import jumpLandUrl from '../assets/animations/jump-land.glb'
import jumpLoopUrl from '../assets/animations/jump-loop.glb'
import jumpStartUrl from '../assets/animations/jump-start.glb'

export type RetargetedClipId = 'jump-land' | 'jump-loop' | 'jump-start'

export type RetargetedClipSource = {
  readonly libraryClip: string
  readonly url: string
}

/* @important Every entry is produced by scripts/retarget-animations.mjs from the
   Universal Animation Library in assets/library, and must be listed there too:
   the script is plain Node and cannot read this file's GLB imports. */
export const RETARGETED_CLIP_SOURCES: Readonly<Record<RetargetedClipId, RetargetedClipSource>> = {
  'jump-land': { libraryClip: 'Jump_Land', url: jumpLandUrl },
  'jump-loop': { libraryClip: 'Jump_Loop', url: jumpLoopUrl },
  'jump-start': { libraryClip: 'Jump_Start', url: jumpStartUrl },
}

export const RETARGETED_CLIP_IDS = Object.keys(RETARGETED_CLIP_SOURCES) as readonly RetargetedClipId[]
