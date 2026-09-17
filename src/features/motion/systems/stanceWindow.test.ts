import { describe, expect, it } from 'vitest'

import { blendWindows, footStance, isInWindow, wrappedPhase } from './stanceWindow'

const WALK = { left: [0.24, 0.74] as const, right: [0.73, 0.21] as const }
const RUN = { left: [0.18, 0.64] as const, right: [0.67, 0.18] as const }

describe('isInWindow', () => {
  it('reads a plain window', () => {
    expect(isInWindow(0.5, [0.24, 0.74])).toBe(true)
    expect(isInWindow(0.9, [0.24, 0.74])).toBe(false)
  })

  it('reads a window that wraps the end of the cycle', () => {
    expect(isInWindow(0.95, [0.73, 0.21])).toBe(true)
    expect(isInWindow(0.05, [0.73, 0.21])).toBe(true)
    expect(isInWindow(0.5, [0.73, 0.21])).toBe(false)
  })

  it('wraps the phase it is given', () => {
    expect(wrappedPhase(1.25)).toBeCloseTo(0.25, 6)
    expect(wrappedPhase(-0.25)).toBeCloseTo(0.75, 6)
    expect(isInWindow(1.5, [0.24, 0.74])).toBe(true)
  })
})

describe('blendWindows', () => {
  it('returns the walk window at share zero and the run window at one', () => {
    expect(blendWindows(WALK.left, RUN.left, 0)).toEqual(WALK.left)
    expect(blendWindows(WALK.left, RUN.left, 1)).toEqual(RUN.left)
  })

  it('takes the short way round when an edge crosses the cycle end', () => {
    const [from] = blendWindows([0.95, 0.4], [0.05, 0.4], 0.5)

    expect(from).toBeCloseTo(0, 6)
  })
})

describe('footStance', () => {
  const base = { grounded: true, phase: 0.5, runWindows: RUN, walkWindows: WALK }

  it('plants both feet while the body is standing', () => {
    expect(footStance({ ...base, blendShare: 0.05 })).toEqual({ left: true, right: true })
  })

  it('plants nothing in the air', () => {
    expect(footStance({ ...base, blendShare: 0.8, grounded: false })).toEqual({ left: false, right: false })
  })

  it('reads the walk windows at a walking pace', () => {
    expect(footStance({ ...base, blendShare: 0.3, phase: 0.5 })).toEqual({ left: true, right: false })
    expect(footStance({ ...base, blendShare: 0.3, phase: 0.95 })).toEqual({ left: false, right: true })
  })

  it('blends toward the run windows above the run share', () => {
    const atRunSpeed = footStance({ ...base, blendShare: 1, phase: 0.7 })
    const atWalkSpeed = footStance({ ...base, blendShare: 0.3, phase: 0.7 })

    expect(atRunSpeed.left).toBe(false)
    expect(atRunSpeed.right).toBe(true)
    expect(atWalkSpeed.left).toBe(true)
  })

  it('treats a backpedal like a forward gait of the same magnitude', () => {
    expect(footStance({ ...base, blendShare: -0.3, phase: 0.5 }))
      .toEqual(footStance({ ...base, blendShare: 0.3, phase: 0.5 }))
  })
})
