import { describe, expect, it } from 'vitest'

import { createBoxWorldTrace, SURFACE_CLIP_EPSILON_METERS, type SolidBox, type Vector3Tuple } from './boxTrace'

const FLOOR: SolidBox = { center: [0, -0.5, 0], halfExtents: [20, 0.5, 20] }
const WALL: SolidBox = { center: [2, 1, 0], halfExtents: [0.5, 1, 4] }
const BODY_HALF_EXTENTS: Vector3Tuple = [0.3, 0.9, 0.3]

describe('createBoxWorldTrace', () => {
  it('reports open space as a clean move', () => {
    const trace = createBoxWorldTrace([FLOOR, WALL])
    const result = trace([0, 0.9, 0], [0, 0.9, 3], BODY_HALF_EXTENTS)

    expect(result.hit).toBe(false)
    expect(result.fraction).toBe(1)
  })

  it('stops the body short of a wall and faces the normal back at it', () => {
    const trace = createBoxWorldTrace([FLOOR, WALL])
    const result = trace([0, 0.9, 0], [4, 0.9, 0], BODY_HALF_EXTENTS)

    expect(result.hit).toBe(true)
    expect(result.normal).toEqual([-1, 0, 0])
    const travelled = result.fraction * 4
    expect(travelled).toBeLessThan(1.2)
    expect(travelled).toBeGreaterThan(1.2 - 4 * SURFACE_CLIP_EPSILON_METERS - 1e-9)
  })

  it('finds the floor below a body standing on it', () => {
    const trace = createBoxWorldTrace([FLOOR])
    const result = trace([0, 0.9, 0], [0, 0.85, 0], BODY_HALF_EXTENTS)

    expect(result.hit).toBe(true)
    expect(result.normal).toEqual([0, 1, 0])
  })

  it('reports a body embedded in geometry as start solid', () => {
    const trace = createBoxWorldTrace([WALL])
    const result = trace([2, 1, 0], [3, 1, 0], BODY_HALF_EXTENTS)

    expect(result.startSolid).toBe(true)
    expect(result.fraction).toBe(0)
  })

  it('takes the nearest of several solids', () => {
    const near: SolidBox = { center: [1, 1, 0], halfExtents: [0.1, 1, 1] }
    const trace = createBoxWorldTrace([WALL, near])
    const result = trace([-2, 1, 0], [4, 1, 0], BODY_HALF_EXTENTS)

    expect(result.fraction * 6 - 2).toBeCloseTo(0.6, 2)
  })

  it('ignores a solid the move travels away from', () => {
    const trace = createBoxWorldTrace([WALL])
    const result = trace([0, 1, 0], [-3, 1, 0], BODY_HALF_EXTENTS)

    expect(result.hit).toBe(false)
  })
})
