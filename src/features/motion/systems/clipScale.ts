import { Vector3 } from 'three'
import type { AnimationClip, KeyframeTrack, Object3D } from 'three'

const HIPS_BONE = /Hips$/
const HIPS_POSITION_TRACK = /Hips\.position$/

export function hipsRestHeight(root: Object3D): number {
  let hips: Object3D | null = null
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    if (!hips && HIPS_BONE.test(node.name)) hips = node
  })
  if (!hips) throw new Error('rig has no Hips bone, so a clip cannot be scaled onto it')
  const inRig = (hips as Object3D).getWorldPosition(new Vector3())
  return root.worldToLocal(inRig).y
}

export function clipHipsHeight(clip: AnimationClip): number {
  const track = clip.tracks.find((candidate: KeyframeTrack) => HIPS_POSITION_TRACK.test(candidate.name))
  if (!track) throw new Error(`clip "${clip.name}" has no hips position track, so its scale is unknown`)
  return track.values[1]
}

export function clipToRigScale(clip: AnimationClip, root: Object3D): number {
  const clipHeight = clipHipsHeight(clip)
  if (clipHeight === 0) throw new Error(`clip "${clip.name}" holds a hips height of zero`)
  return hipsRestHeight(root) / clipHeight
}

export function scaleClipPositions(clip: AnimationClip, factor: number): AnimationClip {
  if (factor === 1) return clip
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue
    for (let index = 0; index < track.values.length; index += 1) track.values[index] *= factor
  }
  return clip
}
