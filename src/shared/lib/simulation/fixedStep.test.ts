import { describe, expect, it } from 'vitest'

import { advanceFixedStep, createFixedStepState } from './fixedStep'

const options = { stepHz: 30 }

describe('fixed step', () => {
  it('advances exact tick boundaries without losing a step to float precision', () => {
    const result = advanceFixedStep(createFixedStepState(), 100, options)
    expect(result.steps).toBe(3)
    expect(result.state.accumulatorMs).toBeCloseTo(0)
  })

  it('freezes instead of catching up through a hidden tab', () => {
    const result = advanceFixedStep(createFixedStepState(), 16, options, true)
    expect(result.state.freezeReason).toBe('hidden')
    expect(result.steps).toBe(0)
  })
})
