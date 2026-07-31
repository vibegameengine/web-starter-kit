import type { Object3D } from 'three'

import { normalizeBoneName } from './mixamoRig'

/**
 * The pose a body was actually standing in at the instant it died.
 *
 * The ragdoll is built to collapse FROM a standing pose — that is what
 * `startPoses` exists for. But an authored pose is a guess about a moment: a
 * body shot mid-stride was not in "Стойка", and one facing north does not fall
 * facing south. Handing the physics a canned pose reads exactly like what it is,
 * a second body swapped in for the first.
 *
 * So the corpse is posed from the dying body itself. Local bone transforms are
 * copied verbatim — the same animation frame, down to the keyframe — and the
 * host puts the corpse at the same yaw. Nothing here interpolates or interprets:
 * a snapshot, then the same snapshot applied.
 *
 * LOCAL transforms rather than world ones, deliberately: they are what a
 * skeleton is authored in, so the copy is valid wherever the corpse is parented,
 * and it needs no matrix update on either side to be correct.
 */
type CapturedBonePose = {
  readonly position: readonly [number, number, number]
  readonly quaternion: readonly [number, number, number, number]
  /**
   * Copied, not assumed to be 1. A bone's local POSITION is measured in its
   * parent's scaled frame, so transplanting positions without the scales that
   * gave them meaning puts every joint at the wrong distance: the first attempt
   * dropped a corpse that was visibly larger than the body it replaced and came
   * apart at the joints.
   */
  readonly scale: readonly [number, number, number]
}

/** Bone name (normalised) → the transform it held. */
export type CapturedPose = ReadonlyMap<string, CapturedBonePose>

/**
 * Reads every bone under `root`. Names are normalised through the same rule the
 * ragdoll rig uses, so a snapshot taken from an FBX-loaded skeleton still
 * applies to one whose `mixamorig:` colons were stripped by a converter.
 */
export function captureBonePose(root: Object3D): CapturedPose {
  const pose = new Map<string, CapturedBonePose>()
  root.traverse((object) => {
    if (!(object as { isBone?: boolean }).isBone) return
    pose.set(normalizeBoneName(object.name), {
      position: [object.position.x, object.position.y, object.position.z],
      quaternion: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
      scale: [object.scale.x, object.scale.y, object.scale.z],
    })
  })
  return pose
}

/**
 * Writes a snapshot back onto a skeleton, in place.
 *
 * Bones absent from the snapshot are left alone rather than reset: a rig with an
 * extra bone the source did not have keeps its bind transform instead of
 * collapsing to the origin.
 */
export function applyCapturedPose(root: Object3D, pose: CapturedPose): void {
  if (pose.size === 0) return
  root.traverse((object) => {
    if (!(object as { isBone?: boolean }).isBone) return
    const captured = pose.get(normalizeBoneName(object.name))
    if (!captured) return
    object.position.set(captured.position[0], captured.position[1], captured.position[2])
    object.quaternion.set(
      captured.quaternion[0],
      captured.quaternion[1],
      captured.quaternion[2],
      captured.quaternion[3],
    )
    object.scale.set(captured.scale[0], captured.scale[1], captured.scale[2])
  })
  // The ragdoll's bodies are built from bone WORLD transforms, so the chain has
  // to be resolved before `buildRagdollSpec` reads it — not at the next render.
  root.updateWorldMatrix(true, true)
}
