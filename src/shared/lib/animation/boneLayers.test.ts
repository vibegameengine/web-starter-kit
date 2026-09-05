import { describe, expect, it } from 'vitest'
import { AnimationClip, NumberKeyframeTrack, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'

import { createLayeredClip, trackBelongsToLayer } from './boneLayers'

describe('trackBelongsToLayer', () => {
  it('gives the hips and everything below them to the lower layer', () => {
    for (const bone of ['mixamorigHips', 'mixamorigLeftUpLeg', 'mixamorigRightLeg', 'mixamorigLeftFoot', 'mixamorigRightToeBase']) {
      expect(trackBelongsToLayer(`${bone}.quaternion`, 'lower')).toBe(true)
      expect(trackBelongsToLayer(`${bone}.quaternion`, 'upper')).toBe(false)
    }
  })

  it('gives the spine and everything above it to the upper layer', () => {
    for (const bone of ['mixamorigSpine', 'mixamorigSpine2', 'mixamorigNeck', 'mixamorigHead', 'mixamorigLeftArm', 'mixamorigRightHand']) {
      expect(trackBelongsToLayer(`${bone}.quaternion`, 'upper')).toBe(true)
      expect(trackBelongsToLayer(`${bone}.quaternion`, 'lower')).toBe(false)
    }
  })

  it('reads a bone name whichever spelling the loader produced', () => {
    // Straight off an FBX the namespace colon survives; three's glTF loader
    // strips it. Matching only one spelling produces a silently EMPTY layer.
    expect(trackBelongsToLayer('mixamorig:Hips.position', 'lower')).toBe(true)
    expect(trackBelongsToLayer('mixamorigHips.position', 'lower')).toBe(true)
    expect(trackBelongsToLayer('mixamorig1:LeftArm.quaternion', 'upper')).toBe(true)
  })

  it('keeps the hips position with the legs, not with the torso', () => {
    // The pelvis carries the body's height and bob. An upper action that could
    // write it would lift a running body off the ground.
    expect(trackBelongsToLayer('mixamorigHips.position', 'lower')).toBe(true)
    expect(trackBelongsToLayer('mixamorigHips.position', 'upper')).toBe(false)
  })

  it('ignores a node that is not part of a Mixamo rig at all', () => {
    expect(trackBelongsToLayer('Armature.position', 'lower')).toBe(false)
    expect(trackBelongsToLayer('Armature.position', 'upper')).toBe(false)
  })

  it('keeps a leaf toe end with the legs, not with the torso', () => {
    // Mixamo ships `LeftToe_End`/`RightToe_End` on most rigs. Matched only as
    // `ToeBase`, the tips land in the UPPER layer and a swing may write them.
    for (const bone of ['mixamorigLeftToe_End', 'mixamorig:RightToe_End']) {
      expect(trackBelongsToLayer(`${bone}.quaternion`, 'lower')).toBe(true)
      expect(trackBelongsToLayer(`${bone}.quaternion`, 'upper')).toBe(false)
    }
  })

  it('reads the node out of a track name that carries a path and a property', () => {
    expect(trackBelongsToLayer('Armature/mixamorigLeftFoot.quaternion', 'lower')).toBe(true)
  })
})

function take(): AnimationClip {
  return new AnimationClip('mixamo.com', 1, [
    new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 1, 0, 0, 1, 0]),
    new QuaternionKeyframeTrack('mixamorigLeftUpLeg.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new QuaternionKeyframeTrack('mixamorigRightArm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new NumberKeyframeTrack('someProp.morphTargetInfluences[0]', [0, 1], [0, 1]),
  ])
}

describe('createLayeredClip', () => {
  it('splits one take into two clips that share no bone', () => {
    const source = take()
    const lower = createLayeredClip(source, 'lower', 'run.lower')
    const upper = createLayeredClip(source, 'upper', 'run.upper')

    expect(lower.tracks.map((track) => track.name)).toEqual(['mixamorigHips.position', 'mixamorigLeftUpLeg.quaternion'])
    expect(upper.tracks.map((track) => track.name)).toEqual(['mixamorigSpine.quaternion', 'mixamorigRightArm.quaternion'])
    // Disjoint is the property that lets both play at full weight at once.
    const shared = lower.tracks.filter((track) => upper.tracks.some((other) => other.name === track.name))
    expect(shared).toEqual([])
  })

  it('names the layer and leaves the source take untouched', () => {
    const source = take()
    const trackCount = source.tracks.length
    const layered = createLayeredClip(source, 'upper', 'swipe.upper')
    expect(layered.name).toBe('swipe.upper')
    // The source belongs to the asset cache and is shared with every other imp.
    expect(source.name).toBe('mixamo.com')
    expect(source.tracks).toHaveLength(trackCount)
  })
})
