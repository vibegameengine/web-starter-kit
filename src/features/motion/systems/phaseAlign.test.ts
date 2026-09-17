import { describe, expect, it } from 'vitest'

import { alignedPhase, phaseOffsetOf, wrapPhase } from './phaseAlign'

const forward = { left: [0.1, 0.6] as const, right: [0.6, 1.1] as const }

describe('phaseAlign', () => {
  it('wraps a phase into one cycle', () => {
    expect(wrapPhase(1.25)).toBeCloseTo(0.25)
    expect(wrapPhase(-0.25)).toBeCloseTo(0.75)
  })

  it('offsets a clip onto the reference plant', () => {
    const strafe = { left: [0.35, 0.85] as const, right: [0.85, 1.35] as const }
    const offset = phaseOffsetOf(strafe, forward)
    expect(offset).toBeCloseTo(0.25)
    expect(alignedPhase(forward.left[0], offset)).toBeCloseTo(strafe.left[0])
  })

  it('leaves the reference clip untouched', () => {
    expect(phaseOffsetOf(forward, forward)).toBeCloseTo(0)
  })

  it('takes the short way round the cycle', () => {
    const late = { left: [0.05, 0.55] as const, right: [0.55, 1.05] as const }
    expect(phaseOffsetOf(late, forward)).toBeCloseTo(0.95)
  })
})
