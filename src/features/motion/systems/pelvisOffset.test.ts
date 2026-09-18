import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import { localDropOffset } from './pelvisOffset'

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
})
