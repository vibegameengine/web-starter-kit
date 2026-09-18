import { describe, expect, it } from 'vitest'
import { AnimationClip, VectorKeyframeTrack } from 'three'

import { unitScaleFor } from './clipScale'

function clipWithHips(name: string, hipsHeight: number): AnimationClip {
  return new AnimationClip(name, 1, [new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, hipsHeight, 0, 0, hipsHeight, 0])])
}

describe('unitScaleFor', () => {
  /* @important The scale between a clip and the rig is a UNIT conversion, the
     same for every clip cut from one skeleton. Deriving it from each clip's own
     first key made it a function of the pose: a run holds its hips lower than a
     stand, so the run was scaled up by that difference and the whole character
     ran a hand's width above the floor. One reference clip — the standing one —
     sets the scale for all of them. */
  it('gives every clip of a skeleton the scale of the standing reference', () => {
    const idle = clipWithHips('idle', 1)
    const run = clipWithHips('run', 0.88)
    expect(unitScaleFor(idle, 0.99)).toBeCloseTo(0.99, 9)
    expect(unitScaleFor(idle, 0.99)).not.toBeCloseTo(0.99 / 0.88, 3)
    expect(run.tracks[0].values[1]).toBeCloseTo(0.88, 5)
  })

  it('refuses a reference with no height to scale from', () => {
    expect(() => unitScaleFor(clipWithHips('flat', 0), 0.99)).toThrow()
  })
})
