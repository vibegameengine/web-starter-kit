import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import { carryStep, localDropOffset } from './pelvisOffset'

const UP = new Vector3(0, 1, 0)

describe('localDropOffset', () => {
  it('drops straight down when the parent is not turned', () => {
    const offset = localDropOffset(new Quaternion(), new Vector3(1, 1, 1), 0.2)
    expect(offset.x).toBeCloseTo(0, 9)
    expect(offset.y).toBeCloseTo(-0.2, 9)
    expect(offset.z).toBeCloseTo(0, 9)
  })

  /* @important The pelvis drop is a world-vertical offset, and the bone it is
     written to lives in a parent that turns with the body. Taking the bone's
     world position, lowering it and converting the whole point back is what
     dragged the pelvis 38 cm sideways through a turn: the round trip rewrites X
     and Z as well, from a parent matrix that belongs to the frame before. Only
     the offset is converted here, and only as a direction. */
  it('still drops straight down in the world when the parent is turned', () => {
    const turned = new Quaternion().setFromAxisAngle(UP, 1.1)
    const offset = localDropOffset(turned, new Vector3(1, 1, 1), 0.2)
    const inWorld = offset.clone().applyQuaternion(turned)

    expect(inWorld.x).toBeCloseTo(0, 9)
    expect(inWorld.y).toBeCloseTo(-0.2, 9)
    expect(inWorld.z).toBeCloseTo(0, 9)
  })

  it('drops straight down under a parent tipped onto its side', () => {
    const tipped = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
    const inWorld = localDropOffset(tipped, new Vector3(1, 1, 1), 0.3).applyQuaternion(tipped)

    expect(inWorld.y).toBeCloseTo(-0.3, 9)
  })

  it('answers in the parent own units when the rig is scaled', () => {
    const offset = localDropOffset(new Quaternion(), new Vector3(100, 100, 100), 0.2)
    expect(offset.y).toBeCloseTo(-0.002, 9)
  })

  it('asks for nothing when there is nothing to drop', () => {
    expect(localDropOffset(new Quaternion(), new Vector3(1, 1, 1), 0).length()).toBe(0)
  })

  /* @important A negative drop is a RAISE, and it has to be allowed: when the
     capsule steps down off a tread the pelvis is carried up relative to it for a
     few frames so the hips stay where they were in the world. */
  it('raises the pelvis for a negative drop', () => {
    const offset = localDropOffset(new Quaternion(), new Vector3(1, 1, 1), -0.15)
    expect(offset.y).toBeCloseTo(0.15, 9)
  })
})

describe('carryStep', () => {
  /* @important The capsule climbs a step in a single tick and the mesh is drawn
     on the capsule, so without this the hips jump a whole stair rise between two
     frames — and the foot still standing on the lower tread falls out of the
     leg's reach and hangs in the air until the pelvis catches up. The jump is
     absorbed into the pelvis offset on the tick it happens, which keeps the hips
     continuous in the world, and the solver then settles it over the frames
     that follow. */
  it('absorbs a step up into the pelvis offset at once', () => {
    expect(carryStep(0.02, 0.15, true)).toBeCloseTo(0.17, 9)
  })

  it('absorbs a step down the other way', () => {
    expect(carryStep(0, -0.15, true)).toBeCloseTo(-0.15, 9)
  })

  it('ignores the ordinary rise and fall of walking on the flat', () => {
    expect(carryStep(0.02, 0.004, true)).toBeCloseTo(0.02, 9)
  })

  it('ignores vertical motion in the air, which is a jump and not a step', () => {
    expect(carryStep(0.02, 0.3, false)).toBeCloseTo(0.02, 9)
  })
})
