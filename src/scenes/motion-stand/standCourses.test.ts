import { describe, expect, it } from 'vitest'

import { STAIR_COUNT, STAIR_RISE, STAIR_RUN, STAIR_START_Z, STAND_COURSES, surfaceHeightAt } from './standCourses'

describe('the stand staircase', () => {
  const flight = STAND_COURSES.stairs

  it('starts at floor level', () => {
    expect(surfaceHeightAt(flight, 0, STAIR_START_Z - 0.1)).toBeCloseTo(0, 6)
  })

  it('rises one step per tread, all the way up', () => {
    for (let step = 0; step < STAIR_COUNT; step += 1) {
      const middleOfTread = STAIR_START_Z + STAIR_RUN * (step + 0.5)
      expect(surfaceHeightAt(flight, 0, middleOfTread)).toBeCloseTo(STAIR_RISE * (step + 1), 6)
    }
  })

  it('has treads shorter than a stride, so footfalls meet the edges', () => {
    expect(STAIR_RUN).toBeLessThan(0.5)
  })

  it('leaves a landing at the top to stop on', () => {
    const top = STAIR_START_Z + STAIR_RUN * STAIR_COUNT + 0.5
    expect(surfaceHeightAt(flight, 0, top)).toBeCloseTo(STAIR_RISE * STAIR_COUNT, 6)
  })

  it('keeps the old ledge and the flat floor as courses of their own', () => {
    expect(STAND_COURSES.flat).toHaveLength(1)
    expect(STAND_COURSES.ledge).toHaveLength(2)
  })
})
