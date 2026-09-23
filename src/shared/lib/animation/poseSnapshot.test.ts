import { describe, expect, it } from 'vitest'
import { AnimationClip, AnimationMixer, Bone, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three'

import { createPoseSnapshot } from './poseSnapshot'

function rigWithBone(): { root: Object3D; bone: Bone } {
  const root = new Object3D()
  const bone = new Bone()
  bone.name = 'knee'
  root.add(bone)
  return { bone, root }
}

const HELD = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4)
const NUDGE = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.1)

function heldClip(): AnimationClip {
  return new AnimationClip('held', 1, [new QuaternionKeyframeTrack('knee.quaternion', [0, 1], [...HELD.toArray(), ...HELD.toArray()])])
}

/* @important three's PropertyMixer writes a bone only when the value it mixed
   differs from the one it wrote last time. Holding one frame of a clip, the
   mixer stops writing, and anything that turned the bone after it — an
   inertial offset, a warp, a leg solve — is still on the bone next frame and
   gets turned again. Measured on the landing: the inertial offset compounded
   for fifteen frames and put the feet above the hips. */
describe('the mixer on a held frame', () => {
  it('leaves a pass-modified bone alone, so passes compound', () => {
    const { bone, root } = rigWithBone()
    const mixer = new AnimationMixer(root)
    mixer.clipAction(heldClip()).play()
    mixer.setTime(0.5)
    bone.quaternion.premultiply(NUDGE)
    mixer.setTime(0.5)
    expect(bone.quaternion.angleTo(HELD)).toBeGreaterThan(0.05)
  })
})

describe('createPoseSnapshot', () => {
  it('starts every frame from what the mixer produced, whether or not it wrote', () => {
    const { bone, root } = rigWithBone()
    const mixer = new AnimationMixer(root)
    const snapshot = createPoseSnapshot(root)
    mixer.clipAction(heldClip()).play()
    for (let frame = 0; frame < 5; frame += 1) {
      snapshot.restore()
      mixer.setTime(0.5)
      snapshot.capture()
      bone.quaternion.premultiply(NUDGE)
    }
    snapshot.restore()
    mixer.setTime(0.5)
    expect(bone.quaternion.angleTo(HELD)).toBeLessThan(1e-6)
  })

  it('keeps positions as well as rotations', () => {
    const { bone, root } = rigWithBone()
    const snapshot = createPoseSnapshot(root)
    bone.position.set(0, 1, 0)
    snapshot.capture()
    bone.position.set(5, 5, 5)
    snapshot.restore()
    expect(bone.position.toArray()).toEqual([0, 1, 0])
  })
})
