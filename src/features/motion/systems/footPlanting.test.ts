import { describe, expect, it } from 'vitest'

import {
  alignmentAlpha,
  contactWeight,
  DEFAULT_MAX_HOLD,
  DEFAULT_PLANT_HYSTERESIS,
  footContactWeight,
  holdWeight,
  plantDecision,
  plantedTarget,
  updatePlant,
  wantsToPlant,
} from './footPlanting'

describe('wantsToPlant', () => {
  const near = { distanceToGround: 0.03, footSpeed: 0.1, plantDistance: 0.12, speedThreshold: 0.35 }

  it('plants a foot that is near the ground and slow', () => {
    expect(wantsToPlant(near)).toBe(true)
  })

  it('refuses a foot that is near the ground but moving', () => {
    expect(wantsToPlant({ ...near, footSpeed: 1.4 })).toBe(false)
  })

  it('refuses a foot that is slow but in the air', () => {
    expect(wantsToPlant({ ...near, distanceToGround: 0.3 })).toBe(false)
  })
})

describe('plantDecision', () => {
  const base = { hysteresis: DEFAULT_PLANT_HYSTERESIS, wantedToPlant: false, wantsToPlant: true, wasPlanted: false }

  it('plants on the frame the foot first wants to', () => {
    expect(plantDecision({ ...base, drift: 0 })).toBe('planted')
  })

  it('holds a planted foot while it stays inside the unplant radius', () => {
    expect(plantDecision({ ...base, drift: 0.2, wantedToPlant: true, wasPlanted: true })).toBe('planted')
  })

  it('releases a planted foot once it is carried past the unplant radius', () => {
    expect(plantDecision({ ...base, drift: 0.25, wantedToPlant: true, wasPlanted: true })).toBe('unplanted')
  })

  it('replants only inside the inner radius', () => {
    expect(plantDecision({ ...base, drift: 0.04, wantedToPlant: true })).toBe('replanted')
    expect(plantDecision({ ...base, drift: 0.15, wantedToPlant: true })).toBe('unplanted')
  })

  it('never plants a foot that does not want to', () => {
    expect(plantDecision({ ...base, drift: 0, wantsToPlant: false, wasPlanted: true })).toBe('unplanted')
  })
})

describe('alignmentAlpha', () => {
  it('is full at or below the plant speed and gone at the unalignment speed', () => {
    expect(alignmentAlpha(0.1, 1.2, 0.35)).toBe(1)
    expect(alignmentAlpha(1.2, 1.2, 0.35)).toBe(0)
  })

  it('fades between the two thresholds', () => {
    expect(alignmentAlpha(0.775, 1.2, 0.35)).toBeCloseTo(0.5, 6)
  })
})

describe('contactWeight', () => {
  const foot = { ankleHeight: 0.09, plantMargin: 0.06, surfaceY: 0, swingMargin: 0.22 }

  it('is one for a foot resting on the surface', () => {
    expect(contactWeight({ ...foot, footY: 0.1 })).toBe(1)
  })

  it('is zero for a foot lifted past the swing margin', () => {
    expect(contactWeight({ ...foot, footY: 0.4 })).toBe(0)
  })
})

describe('updatePlant and plantedTarget', () => {
  it('locks where the foot was on the frame it planted', () => {
    const plant = updatePlant({
      contact: 1,
      footX: 0.4,
      footZ: 1.2,
      hipX: 0,
      hipZ: 1,
      reach: 0.9,
      state: { lockX: 0, lockZ: 0, locked: false, weight: 0 },
    })

    expect(plant.locked).toBe(true)
    expect(plant.lockX).toBeCloseTo(0.4, 6)
  })

  it('pulls the foot toward its lock by the plant weight', () => {
    const target = plantedTarget(
      { lockX: 1, lockZ: 0, locked: true, weight: 0.5 },
      [0, 0.1, 0],
      0,
      0.09,
    )

    expect(target[0]).toBeCloseTo(0.5, 6)
  })
})

describe('footContactWeight', () => {
  const base = { ankleHeight: 0.09, maxStepDrop: 0.55, plantMargin: 0.06, surfaceY: 0, swingMargin: 0.22 }

  it('keeps a stance foot in full contact over its own ground', () => {
    expect(footContactWeight({ ...base, footY: 0.09, stance: true })).toBeCloseTo(1)
    expect(footContactWeight({ ...base, footY: 0.4, stance: true })).toBeCloseTo(1)
  })

  it('fades a stance foot out past the reach of the leg', () => {
    expect(footContactWeight({ ...base, footY: 0.75, stance: true })).toBeLessThan(1)
    expect(footContactWeight({ ...base, footY: 1.0, stance: true })).toBe(0)
  })

  it('fades a swing foot out by height', () => {
    expect(footContactWeight({ ...base, footY: 0.12, stance: false })).toBeCloseTo(1)
    expect(footContactWeight({ ...base, footY: 0.4, stance: false })).toBe(0)
  })

  it('leaves a lifted swing foot all but free of the ground', () => {
    expect(footContactWeight({ ...base, footY: 0.3, stance: false })).toBeLessThan(0.1)
  })
})

describe('holdWeight', () => {
  it('holds a stance foot on its lock point', () => {
    expect(holdWeight(true, 0, DEFAULT_MAX_HOLD)).toBeCloseTo(1)
  })

  it('eases the hold off as the body carries the foot away', () => {
    const half = holdWeight(true, DEFAULT_MAX_HOLD * 0.75, DEFAULT_MAX_HOLD)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
    expect(holdWeight(true, DEFAULT_MAX_HOLD, DEFAULT_MAX_HOLD)).toBe(0)
  })

  it('never holds a swing foot', () => {
    expect(holdWeight(false, 0, DEFAULT_MAX_HOLD)).toBe(0)
  })
})
