import { describe, expect, it } from 'vitest'

import { bobHeight, spinAngle } from './motion'

describe('spinAngle', () => {
  it('is zero at t=0', () => {
    expect(spinAngle(0)).toBe(0)
  })

  it('completes exactly one turn per 1/speed seconds', () => {
    // 0.25 rev/s → a full 2π turn after 4 seconds.
    expect(spinAngle(4, { speed: 0.25 })).toBeCloseTo(Math.PI * 2)
  })

  it('scales linearly with time', () => {
    expect(spinAngle(2, { speed: 1 })).toBeCloseTo(spinAngle(1, { speed: 1 }) * 2)
  })
})

describe('bobHeight', () => {
  it('rests at base at t=0', () => {
    expect(bobHeight(0, { base: 1 })).toBeCloseTo(1)
  })

  it('peaks at +amplitude a quarter-period in', () => {
    expect(bobHeight(0.25, { amplitude: 0.15, frequency: 1, base: 0 })).toBeCloseTo(0.15)
  })

  it('troughs at -amplitude three-quarters in', () => {
    expect(bobHeight(0.75, { amplitude: 0.15, frequency: 1, base: 0 })).toBeCloseTo(-0.15)
  })
})
