import { describe, expect, it } from 'vitest'
import { AnimationClip, Bone, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'

import {
  facingAlignment,
  limbAlignment,
  retargetClip,
  retargetedRotation,
  UE5_TO_MIXAMO,
  type RetargetBone,
} from './retarget'

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

function turn(axis: Vector3, radians: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis, radians)
}

describe('retargetedRotation', () => {
  /* @important The transfer is of the change from a reference pose, measured in
     world axes: source now · inverse(source reference) · target reference. The
     bones' own local axes never enter it, which is what lets it move a pose
     between two rigs that agree on nothing but where the body is. */
  it('gives the target its own rest when the source is at its reference', () => {
    const sourceRest = turn(Z, 0.7)
    const targetRest = turn(X, -0.3)
    const result = retargetedRotation(sourceRest, sourceRest, targetRest, new Quaternion())
    expect(result.angleTo(targetRest)).toBeLessThan(1e-6)
  })

  it('carries a world-space change from the source over to the target unchanged', () => {
    const sourceRest = turn(Z, 0.7)
    const targetRest = turn(X, -0.3)
    const bend = turn(X, 0.5)
    const result = retargetedRotation(bend.clone().multiply(sourceRest), sourceRest, targetRest, new Quaternion())
    expect(result.angleTo(bend.clone().multiply(targetRest))).toBeLessThan(1e-6)
  })

  /* @important Two characters that face different ways must see a lean
     forward as a lean forward: a change measured about the source's sideways
     axis is turned into the target's before it is applied. Transferred in raw
     world axes, a source facing +X would lean the target sideways. */
  it('turns the change into the target facing', () => {
    const facing = turn(Y, Math.PI / 2)
    const leanAboutSourceSide = turn(Z, 0.4)
    const result = retargetedRotation(leanAboutSourceSide, new Quaternion(), new Quaternion(), facing)
    const expected = facing.clone().multiply(leanAboutSourceSide).multiply(facing.clone().invert())
    expect(result.angleTo(expected)).toBeLessThan(1e-6)
  })
})

describe('facingAlignment', () => {
  it('is nothing when both bodies face the same way', () => {
    const turnBetween = facingAlignment({ left: new Vector3(1, 1, 0), right: new Vector3(-1, 1, 0) }, { left: new Vector3(2, 1, 0), right: new Vector3(-2, 1, 0) })
    expect(turnBetween.angleTo(new Quaternion())).toBeLessThan(1e-6)
  })

  it('is the yaw that takes the source hips line onto the target one', () => {
    const turnBetween = facingAlignment({ left: new Vector3(0, 1, -1), right: new Vector3(0, 1, 1) }, { left: new Vector3(1, 1, 0), right: new Vector3(-1, 1, 0) })
    const sourceLeft = new Vector3(0, 0, -1).applyQuaternion(turnBetween)
    expect(sourceLeft.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-6)
  })
})

describe('limbAlignment', () => {
  /* @important A library in A-pose moved onto a rig in T-pose by the rest
     delta alone puts the arms up where the source has them down: both rests
     count as "no change". The source reference is first swung, limb by limb,
     so each bone points where the target's rest bone points — the automatic
     chain alignment Unreal's IK Retargeter does — and the change is measured
     from that. */
  it('swings a source bone onto the direction the target bone points at rest', () => {
    const alignment = limbAlignment(new Vector3(1, -1, 0), X, new Quaternion())
    expect(new Vector3(1, -1, 0).normalize().applyQuaternion(alignment).distanceTo(X)).toBeLessThan(1e-6)
  })

  it('takes the facing into account before it compares directions', () => {
    const facing = turn(Y, Math.PI / 2)
    const alignment = limbAlignment(new Vector3(0, 0, -1), X, facing)
    const swungSource = new Vector3(0, 0, -1).applyQuaternion(facing).applyQuaternion(alignment)
    expect(swungSource.distanceTo(X)).toBeLessThan(1e-6)
  })
})

function chain(names: readonly string[], offsets: readonly Vector3[], rests: readonly Quaternion[]): { root: Object3D; bones: Bone[] } {
  const root = new Object3D()
  const bones: Bone[] = []
  let parent: Object3D = root
  names.forEach((name, index) => {
    const bone = new Bone()
    bone.name = name
    bone.position.copy(offsets[index])
    bone.quaternion.copy(rests[index])
    parent.add(bone)
    bones.push(bone)
    parent = bone
  })
  root.updateMatrixWorld(true)
  return { root, bones }
}

describe('retargetClip', () => {
  const map: readonly RetargetBone[] = [
    { source: 'pelvis', target: 'Hips', translate: true },
    { align: true, source: 'upperarm_l', target: 'LeftArm', toward: 'lowerarm_l' },
    { source: 'lowerarm_l', target: 'LeftForeArm' },
  ]

  function rigs() {
    const source = chain(
      ['pelvis', 'upperarm_l', 'lowerarm_l'],
      [new Vector3(0, 1, 0), new Vector3(0.2, 0.4, 0), new Vector3(0.2, -0.2, 0)],
      [new Quaternion(), turn(Z, -Math.PI / 4), new Quaternion()],
    )
    const target = chain(
      ['Hips', 'LeftArm', 'LeftForeArm'],
      [new Vector3(0, 110, 0), new Vector3(20, 40, 0), new Vector3(30, 0, 0)],
      [turn(Y, 0.2), turn(X, 0.3), new Quaternion()],
    )
    return { source, target }
  }

  function armDirection(target: { bones: Bone[] }, clip: AnimationClip): Vector3 {
    const track = clip.tracks.find((candidate) => candidate.name === 'LeftArm.quaternion')
    if (!track) throw new Error('no arm track')
    target.bones[1].quaternion.fromArray(track.values, 0)
    target.bones[0].parent?.updateMatrixWorld(true)
    const shoulder = target.bones[1].getWorldPosition(new Vector3())
    return target.bones[2].getWorldPosition(new Vector3()).sub(shoulder).normalize()
  }

  function holding(rotation: Quaternion): AnimationClip {
    return new AnimationClip('hold', 1, [new QuaternionKeyframeTrack('upperarm_l.quaternion', [0], rotation.toArray())])
  }

  /* @important The source's rest is an A-pose with the arm hanging straight
     down; the target's rest holds the arm out along +X. Measured from the
     rests alone, the arm that hangs in the source would stand out level in
     the target. With the limbs aligned, the target's arm points where the
     source's does. */
  it('hangs the target arm where the source arm hangs, not at the target rest', () => {
    const { source, target } = rigs()
    const clip = retargetClip({ clip: holding(turn(Z, -Math.PI / 4)), map, source: source.root, target: target.root })
    expect(armDirection(target, clip).distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-6)
  })

  it('raises the target arm level when the source raises its arm level', () => {
    const { source, target } = rigs()
    const clip = retargetClip({ clip: holding(turn(Z, Math.PI / 4)), map, source: source.root, target: target.root })
    expect(armDirection(target, clip).distanceTo(X)).toBeLessThan(1e-6)
  })

  /* @important The pelvis carries the body's height as well as its turn, and a
     taller target must crouch and jump by its own measure: the source's pelvis
     travel is scaled by the ratio of the two pelvis heights. */
  it('scales the pelvis travel by the ratio of the two pelvis heights', () => {
    const { source, target } = rigs()
    const clip = retargetClip({
      clip: new AnimationClip('dip', 1, [new VectorKeyframeTrack('pelvis.position', [0], [0, 0.5, 0])]),
      map,
      source: source.root,
      target: target.root,
    })
    const track = clip.tracks.find((candidate) => candidate.name === 'Hips.position')!
    expect(track.values[1]).toBeCloseTo(110 - 0.5 * 110, 6)
  })

  /* @important A looping action set to the clip's full duration wraps to its
     first frame, and a clip sampled that way ends on its own first pose:
     measured, the retargeted Jump_Start finished crouched at 0.569 m and
     Jump_Land in the air at 1.009 m, both copies of their frame 0. */
  it('ends on the source clip last pose, not its first', () => {
    const { source, target } = rigs()
    const clip = retargetClip({
      clip: new AnimationClip('rise', 1, [new VectorKeyframeTrack('pelvis.position', [0, 1], [0, 0.5, 0, 0, 1, 0])]),
      map,
      source: source.root,
      target: target.root,
    })
    const track = clip.tracks.find((candidate) => candidate.name === 'Hips.position')!
    expect(track.values[track.values.length - 2]).toBeCloseTo(110, 6)
  })

  it('writes nothing for bones the map does not name', () => {
    const { source, target } = rigs()
    const clip = retargetClip({ clip: new AnimationClip('empty', 1, []), map, source: source.root, target: target.root })
    expect(clip.tracks.every((track) => /^(Hips|LeftArm|LeftForeArm)\./.test(track.name))).toBe(true)
  })
})

describe('UE5_TO_MIXAMO', () => {
  it('maps every limb of the UE5 mannequin onto a Mixamo bone, both sides', () => {
    const sources = UE5_TO_MIXAMO.map((bone) => bone.source)
    for (const name of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'upperarm_r', 'hand_r', 'index_03_r']) {
      expect(sources).toContain(name)
    }
    expect(UE5_TO_MIXAMO.find((bone) => bone.source === 'upperarm_l')?.target).toBe('LeftArm')
    expect(UE5_TO_MIXAMO.find((bone) => bone.source === 'thigh_r')?.target).toBe('RightUpLeg')
  })
})
