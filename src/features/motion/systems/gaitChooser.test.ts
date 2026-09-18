import { describe, expect, it } from 'vitest'

import { chooseGait, DEFAULT_GAIT_HYSTERESIS } from './gaitChooser'

const SPEEDS = { runSpeed: 2.838, walkSpeed: 1.633 }
const base = { hysteresis: DEFAULT_GAIT_HYSTERESIS, previous: 'walk' as const, ...SPEEDS }

describe('chooseGait', () => {
  it('walks at a walking speed', () => {
    expect(chooseGait({ ...base, speed: 1.6 })).toBe('walk')
  })

  it('runs at a running speed', () => {
    expect(chooseGait({ ...base, speed: 2.7 })).toBe('run')
  })

  it('picks the run for a sprint that the walk clip would have to be stretched for', () => {
    expect(chooseGait({ ...base, speed: 2.65 })).toBe('run')
  })

  it('keeps the gait it has inside the band', () => {
    const crossover = (SPEEDS.walkSpeed + SPEEDS.runSpeed) / 2
    expect(chooseGait({ ...base, previous: 'walk', speed: crossover })).toBe('walk')
    expect(chooseGait({ ...base, previous: 'run', speed: crossover })).toBe('run')
  })

  it('leaves the band on either side rather than flapping', () => {
    const crossover = (SPEEDS.walkSpeed + SPEEDS.runSpeed) / 2
    expect(chooseGait({ ...base, previous: 'run', speed: crossover - 0.2 })).toBe('walk')
    expect(chooseGait({ ...base, previous: 'walk', speed: crossover + 0.2 })).toBe('run')
  })
})
