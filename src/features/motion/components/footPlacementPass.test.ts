import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'

import { writeLeg, type LegBones } from './footPlacementPass'

function legChain(): LegBones {
  const thigh = new Object3D()
  const knee = new Object3D()
  const foot = new Object3D()
  const toe = new Object3D()
  thigh.position.set(0, 1, 0)
  knee.position.set(0, -0.45, 0.02)
  foot.position.set(0, -0.45, -0.02)
  toe.position.set(0, -0.08, 0.14)
  foot.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.3)
  thigh.add(knee)
  knee.add(foot)
  foot.add(toe)
  thigh.updateMatrixWorld(true)
  return { foot, knee, thigh, toe }
}

/* @important The legs are solved by turning the thigh and the shin, and a foot
   left to inherit that turn tips with the shin: a knee bent 20 degrees more
   pitched the toe 20 degrees into the step, under the height the push-out had
   just checked it against. Unreal's foot placement writes the foot's own
   rotation back after the leg is solved; the clip's heel-to-toe roll is kept
   whatever the knee did. */
describe('writeLeg', () => {
  it('keeps the foot turned the way the clip turned it in the world', () => {
    const leg = legChain()
    const before = leg.foot.getWorldQuaternion(new Quaternion())
    writeLeg(leg, new Vector3(0, 0.25, 0.15), { lowerLength: 0.45, upperLength: 0.45 }, new Vector3(0, 0, 1))
    const after = leg.foot.getWorldQuaternion(new Quaternion())
    expect(after.angleTo(before)).toBeLessThan(1e-6)
  })

  it('still puts the ankle on the target', () => {
    const leg = legChain()
    writeLeg(leg, new Vector3(0, 0.25, 0.15), { lowerLength: 0.45, upperLength: 0.45 }, new Vector3(0, 0, 1))
    expect(leg.foot.getWorldPosition(new Vector3()).distanceTo(new Vector3(0, 0.25, 0.15))).toBeLessThan(0.01)
  })
})
