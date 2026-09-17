import { describe, expect, it } from 'vitest'

import { locomotionDirectionOf, movementInActorSpace, travelAngleOf } from './locomotionDirection'

describe('movementInActorSpace', () => {
  it('reads world forward as local forward', () => {
    const local = movementInActorSpace({ x: 0, z: 1 }, 0)

    expect(local.z).toBeCloseTo(1, 6)
    expect(local.x).toBeCloseTo(0, 6)
  })

  it('reads the actor own right as positive x', () => {
    const local = movementInActorSpace({ x: -1, z: 0 }, 0)

    expect(local.x).toBeCloseTo(1, 6)
  })

  it('follows the body when it turns', () => {
    const local = movementInActorSpace({ x: 1, z: 0 }, Math.PI / 2)

    expect(local.z).toBeCloseTo(1, 6)
  })
})

describe('locomotionDirectionOf', () => {
  it('calls a standing body idle', () => {
    expect(locomotionDirectionOf({ x: 0, z: 0 })).toBe('idle')
  })

  it('names the four cardinal strides', () => {
    expect(locomotionDirectionOf({ x: 0, z: 1 })).toBe('forward')
    expect(locomotionDirectionOf({ x: 0, z: -1 })).toBe('backward')
    expect(locomotionDirectionOf({ x: 1, z: 0 })).toBe('right')
    expect(locomotionDirectionOf({ x: -1, z: 0 })).toBe('left')
  })

  it('names the four diagonals', () => {
    expect(locomotionDirectionOf({ x: 1, z: 1 })).toBe('forward-right')
    expect(locomotionDirectionOf({ x: -1, z: 1 })).toBe('forward-left')
    expect(locomotionDirectionOf({ x: 1, z: -1 })).toBe('backward-right')
    expect(locomotionDirectionOf({ x: -1, z: -1 })).toBe('backward-left')
  })

  it('keeps a nearly straight stride out of the diagonals', () => {
    expect(locomotionDirectionOf({ x: 0.3, z: 1 })).toBe('forward')
  })
})

describe('travelAngleOf', () => {
  const right = { x: -1, z: 0 }
  const forward = { x: 0, z: 1 }

  it('reads a step to the body right as a quarter turn clockwise', () => {
    expect(travelAngleOf(right, 0)).toBeCloseTo(Math.PI / 2)
  })

  it('reads a step straight ahead as zero however the body faces', () => {
    expect(travelAngleOf(forward, 0)).toBeCloseTo(0)
    expect(travelAngleOf({ x: 1, z: 0 }, Math.PI / 2)).toBeCloseTo(0)
  })

  it('agrees with the direction table it feeds', () => {
    expect(locomotionDirectionOf(movementInActorSpace(right, 0))).toBe('right')
    expect(travelAngleOf(right, 0)).toBeGreaterThan(0)
  })

  it('answers zero for a body that is not travelling', () => {
    expect(travelAngleOf({ x: 0, z: 0 }, 1.2)).toBe(0)
  })
})
