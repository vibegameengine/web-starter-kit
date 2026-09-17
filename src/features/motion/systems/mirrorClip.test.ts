import { describe, expect, it } from 'vitest'
import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'

import { mirrorClip } from './mirrorClip'

function yawClip(): AnimationClip {
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4)
  return new AnimationClip('turn', 1, [
    new QuaternionKeyframeTrack('mixamorigLeftUpLeg.quaternion', [0, 1], [...yaw.toArray(), ...yaw.toArray()]),
    new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [1, 2, 3, 1, 2, 3]),
  ])
}

describe('mirrorClip', () => {
  it('moves a track from one side of the body to the other', () => {
    const mirrored = mirrorClip(yawClip(), 'turn-mirrored')

    expect(mirrored.name).toBe('turn-mirrored')
    expect(mirrored.tracks[0].name).toBe('mixamorigRightUpLeg.quaternion')
  })

  it('turns a yaw into the opposite yaw', () => {
    const mirrored = mirrorClip(yawClip(), 'turn-mirrored')
    const rotation = new Quaternion().fromArray([...mirrored.tracks[0].values].slice(0, 4))
    const axis = new Vector3(0, 0, 1).applyQuaternion(rotation)

    expect(Math.atan2(axis.x, axis.z)).toBeCloseTo(-Math.PI / 4, 6)
  })

  it('reflects a position across the body', () => {
    const mirrored = mirrorClip(yawClip(), 'turn-mirrored')

    expect([...mirrored.tracks[1].values].slice(0, 3)).toEqual([-1, 2, 3])
  })

  it('leaves the source clip untouched', () => {
    const source = yawClip()
    mirrorClip(source, 'turn-mirrored')

    expect(source.tracks[0].name).toBe('mixamorigLeftUpLeg.quaternion')
    expect([...source.tracks[1].values].slice(0, 3)).toEqual([1, 2, 3])
  })

  it('mirroring twice returns the original values', () => {
    const once = mirrorClip(yawClip(), 'once')
    const twice = mirrorClip(once, 'twice')
    const source = yawClip()

    expect(twice.tracks[0].name).toBe(source.tracks[0].name)
    expect([...twice.tracks[0].values]).toEqual([...source.tracks[0].values])
    expect([...twice.tracks[1].values]).toEqual([...source.tracks[1].values])
  })
})
