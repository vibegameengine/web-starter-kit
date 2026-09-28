import { describe, expect, it } from 'vitest'

import { anglesFromOffset, offsetFromAngles, stopsToGain, withChroma } from './lightGeometry'

describe('light geometry', () => {
  it('round-trips the kit sun offset through azimuth and elevation', () => {
    const offset = offsetFromAngles(anglesFromOffset([40, 52, 34]))
    expect(offset[0]).toBeCloseTo(40, 9)
    expect(offset[1]).toBeCloseTo(52, 9)
    expect(offset[2]).toBeCloseTo(34, 9)
  })

  it('puts azimuth zero on +Z and ninety degrees on +X', () => {
    const north = offsetFromAngles({ azimuthDeg: 0, distance: 10, elevationDeg: 0 })
    const east = offsetFromAngles({ azimuthDeg: 90, distance: 10, elevationDeg: 0 })
    expect(north[2]).toBeCloseTo(10, 9)
    expect(east[0]).toBeCloseTo(10, 9)
  })

  it('turns stops into a doubling gain', () => {
    expect(stopsToGain(0)).toBe(1)
    expect(stopsToGain(1)).toBe(2)
    expect(stopsToGain(-2)).toBe(0.25)
  })

  it('keeps a colour at full chroma and greys it at zero', () => {
    expect(withChroma('#8bb4ef', 1)).toBe('#8bb4ef')
    const grey = withChroma('#8bb4ef', 0)
    expect(grey.slice(1, 3)).toBe(grey.slice(3, 5))
    expect(grey.slice(3, 5)).toBe(grey.slice(5, 7))
  })
})
