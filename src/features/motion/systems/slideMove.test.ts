import { describe, expect, it } from 'vitest'

import { createBoxWorldTrace, type SolidBox, type Vector3Tuple } from './boxTrace'
import { GROUNDED_MOTION_PROFILE } from './motionProfile'
import { groundStateAt, slideMove, stepSlideMove, type SlideBody, type SlideContext } from './slideMove'

const HALF_EXTENTS: Vector3Tuple = [0.3, 0.9, 0.3]
const FLOOR: SolidBox = { center: [0, -1, 0], halfExtents: [30, 1, 30] }
const WALL: SolidBox = { center: [3, 1.5, 0], halfExtents: [0.5, 1.5, 6] }
const LOW_SLAB: SolidBox = { center: [3, 0.15, 0], halfExtents: [2, 0.15, 6] }
const TALL_SLAB: SolidBox = { center: [3, 0.4, 0], halfExtents: [2, 0.4, 6] }
const STEP = 1 / 60

function contextFor(solids: readonly SolidBox[], gravity = GROUNDED_MOTION_PROFILE.gravity): SlideContext {
  return { delta: STEP, gravity, profile: GROUNDED_MOTION_PROFILE, trace: createBoxWorldTrace(solids) }
}

function bodyOnFloor(velocity: Vector3Tuple, x = 0): SlideBody {
  return { groundNormal: [0, 1, 0], halfExtents: HALF_EXTENTS, onGround: true, position: [x, 0.9, 0], velocity }
}

describe('slideMove', () => {
  it('keeps a walking body on the floor', () => {
    const context = contextFor([FLOOR])
    const moved = slideMove(bodyOnFloor([2, 0, 0]), context)

    expect(moved.onGround).toBe(true)
    expect(moved.position[1]).toBeCloseTo(0.9, 2)
    expect(moved.position[0]).toBeCloseTo(2 * STEP, 3)
  })

  it('lands a falling body on the floor instead of passing through it', () => {
    const context = contextFor([FLOOR])
    let body: SlideBody = { groundNormal: [0, 1, 0], halfExtents: HALF_EXTENTS, onGround: false, position: [0, 6, 0], velocity: [0, 0, 0] }
    for (let index = 0; index < 120; index += 1) body = slideMove(body, context)

    expect(body.onGround).toBe(true)
    expect(body.position[1]).toBeCloseTo(0.9, 2)
    expect(body.velocity[1]).toBeCloseTo(0, 2)
  })

  it('slides along a wall instead of stopping dead', () => {
    const context = contextFor([FLOOR, WALL])
    const moved = slideMove(bodyOnFloor([3, 0, 3], 2.19), context)

    expect(moved.clipped).toBe(true)
    expect(moved.velocity[0]).toBeCloseTo(0, 2)
    expect(moved.velocity[2]).toBeCloseTo(3, 1)
  })
})

describe('stepSlideMove', () => {
  it('climbs a step below the profile height', () => {
    const context = contextFor([FLOOR, LOW_SLAB])
    let body = bodyOnFloor([2, 0, 0], 0.4)
    for (let index = 0; index < 40; index += 1) {
      body = stepSlideMove({ ...body, velocity: [2, body.velocity[1], 0] }, context)
    }

    expect(body.position[1]).toBeCloseTo(0.9 + 0.3, 2)
    expect(body.onGround).toBe(true)
  })

  it('refuses a step above the profile height', () => {
    const context = contextFor([FLOOR, TALL_SLAB])
    let body = bodyOnFloor([2, 0, 0], 0.4)
    for (let index = 0; index < 40; index += 1) {
      body = stepSlideMove({ ...body, velocity: [2, body.velocity[1], 0] }, context)
    }

    expect(body.position[1]).toBeCloseTo(0.9, 2)
    expect(body.position[0]).toBeLessThan(0.9)
  })

  it('stays glued to the ground when stepping down', () => {
    const context = contextFor([FLOOR, LOW_SLAB])
    let body: SlideBody = { groundNormal: [0, 1, 0], halfExtents: HALF_EXTENTS, onGround: true, position: [3, 1.2, 0], velocity: [-2, 0, 0] }
    for (let index = 0; index < 90; index += 1) {
      body = stepSlideMove({ ...body, velocity: [-2, body.velocity[1], 0] }, context)
    }

    expect(body.onGround).toBe(true)
    expect(body.position[1]).toBeCloseTo(0.9, 2)
  })
})

describe('groundStateAt', () => {
  it('reports no ground when the body is in the air', () => {
    const context = contextFor([FLOOR])
    const body = bodyOnFloor([0, 0, 0])
    const state = groundStateAt([0, 4, 0], body, context)

    expect(state.onGround).toBe(false)
  })
})
