import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'

import {
  DEFAULT_STRIDE_SCALE_LIMITS,
  groundedFootTarget,
  pelvisDropFor,
  strideScaleFor,
  warpedFootTarget,
} from './strideWarp'

const FORWARD = new Vector3(0, 0, 1)

describe('strideScaleFor', () => {
  it('leaves a clip alone when the body matches its speed', () => {
    expect(strideScaleFor(1.57, 1.57)).toBeCloseTo(1, 6)
  })

  it('stretches the stride when the body outruns the clip', () => {
    expect(strideScaleFor(3.14, 1.57)).toBeCloseTo(1.6, 6)
  })

  it('never scales past its limits', () => {
    expect(strideScaleFor(40, 1.57)).toBe(DEFAULT_STRIDE_SCALE_LIMITS.maximum)
    expect(strideScaleFor(0.2, 3.4)).toBe(DEFAULT_STRIDE_SCALE_LIMITS.minimum)
  })

  it('holds still rather than dividing by a clip that does not travel', () => {
    expect(strideScaleFor(3.2, 0)).toBe(1)
  })
})

describe('warpedFootTarget', () => {
  it('pushes a foot further ahead of the hip when the stride grows', () => {
    const warped = warpedFootTarget(new Vector3(0, 0.1, 0.4), new Vector3(0, 0.9, 0), FORWARD, 1.5, new Vector3())

    expect(warped.z).toBeCloseTo(0.6, 6)
    expect(warped.y).toBeCloseTo(0.1, 6)
    expect(warped.x).toBeCloseTo(0, 6)
  })

  it('pulls a trailing foot in by the same factor', () => {
    const warped = warpedFootTarget(new Vector3(0, 0.1, -0.4), new Vector3(0, 0.9, 0), FORWARD, 1.5, new Vector3())

    expect(warped.z).toBeCloseTo(-0.6, 6)
  })

  it('leaves a foot under the hip where it is', () => {
    const warped = warpedFootTarget(new Vector3(0.1, 0.1, 0), new Vector3(0.1, 0.9, 0), FORWARD, 1.5, new Vector3())

    expect(warped.z).toBeCloseTo(0, 6)
    expect(warped.x).toBeCloseTo(0.1, 6)
  })

  it('never moves a foot across the stride direction', () => {
    const warped = warpedFootTarget(new Vector3(0.2, 0.1, 0.4), new Vector3(0, 0.9, 0), FORWARD, 0.5, new Vector3())

    expect(warped.x).toBeCloseTo(0.2, 6)
  })
})

describe('pelvisDropFor', () => {
  it('stays put while every leg can reach', () => {
    const drop = pelvisDropFor([new Vector3(0, 0.9, 0)], [new Vector3(0, 0.1, 0)], 0.85)

    expect(drop).toBe(0)
  })

  it('drops by the worst over-reach', () => {
    const drop = pelvisDropFor(
      [new Vector3(0, 0.9, 0), new Vector3(0.2, 0.9, 0)],
      [new Vector3(0, 0.0, 0), new Vector3(0.2, -0.2, 0)],
      0.85,
    )

    expect(drop).toBeCloseTo(0.25, 6)
  })
})

describe('groundedFootTarget', () => {
  it('lifts a target that sank below the surface', () => {
    const target = groundedFootTarget(new Vector3(0, -0.2, 0), 0.3, 0.09)

    expect(target.y).toBeCloseTo(0.39, 6)
  })

  it('leaves a swinging foot in the air', () => {
    const target = groundedFootTarget(new Vector3(0, 0.8, 0), 0.3, 0.09)

    expect(target.y).toBeCloseTo(0.8, 6)
  })
})
