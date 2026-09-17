import { describe, expect, it } from 'vitest'

import {
  alignmentAlpha,
  contactWeight,
  DEFAULT_PLANT_HYSTERESIS,
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
