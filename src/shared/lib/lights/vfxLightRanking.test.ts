import { describe, expect, it } from 'vitest'

import { assignVfxLightSlots, vfxLightScore, type VfxLightSample } from './vfxLightRanking'

const EYE = { x: 0, y: 0, z: 0 }

function sample(overrides: Partial<VfxLightSample> & { readonly id: number }): VfxLightSample {
  return { distance: 4, intensity: 1, priority: 0, x: 0, y: 0, z: 0, ...overrides }
}

describe('vfxLightScore', () => {
  it('is zero for a light that is off, so a dead VFX never holds a lamp', () => {
    expect(vfxLightScore(sample({ id: 1, intensity: 0 }), EYE)).toBe(0)
  })

  it('does not punish a light for being close — inside its radius it reads full', () => {
    const near = vfxLightScore(sample({ id: 1, z: 1 }), EYE)
    const atRadius = vfxLightScore(sample({ id: 2, z: 4 }), EYE)
    expect(near).toBe(atRadius)
    expect(near).toBe(1)
  })

  it('falls off with distance once the camera is outside the lit sphere', () => {
    expect(vfxLightScore(sample({ id: 1, z: 40 }), EYE)).toBeCloseTo(0.1)
  })
})

describe('assignVfxLightSlots', () => {
  it('gives every light a lamp while there are lamps to give', () => {
    const assignment = assignVfxLightSlots([sample({ id: 1 }), sample({ id: 2 })], EYE, 4, new Map())
    expect(new Set(assignment.values()).size).toBe(2)
    expect(assignment.size).toBe(2)
  })

  it('drops the dimmest when the pool runs out', () => {
    const assignment = assignVfxLightSlots(
      [sample({ id: 1, intensity: 8 }), sample({ id: 2, intensity: 4 }), sample({ id: 3, intensity: 1 })],
      EYE,
      2,
      new Map(),
    )
    expect([...assignment.keys()].sort()).toEqual([1, 2])
  })

  it('lets priority beat brightness outright, so a muzzle flash always lights', () => {
    const assignment = assignVfxLightSlots(
      [sample({ id: 1, intensity: 40 }), sample({ id: 2, intensity: 0.2, priority: 1 })],
      EYE,
      1,
      new Map(),
    )
    expect([...assignment.keys()]).toEqual([2])
  })

  it('never hands out a lamp to a light that is off', () => {
    const assignment = assignVfxLightSlots([sample({ id: 1, intensity: 0 }), sample({ id: 2 })], EYE, 4, new Map())
    expect([...assignment.keys()]).toEqual([2])
  })

  it('keeps a light on the SAME lamp it held last frame', () => {
    const lights = [sample({ id: 1, intensity: 2 }), sample({ id: 2, intensity: 9 })]
    const previous = new Map([[1, 0], [2, 1]])
    expect(assignVfxLightSlots(lights, EYE, 4, previous)).toEqual(previous)
  })

  it('holds a near tie steady instead of swapping the lamp every frame', () => {
    const incumbent = sample({ id: 1, intensity: 1 })
    const challenger = sample({ id: 2, intensity: 1.1 })
    const held = assignVfxLightSlots([incumbent, challenger], EYE, 1, new Map([[1, 0]]))
    expect([...held.keys()]).toEqual([1])

    const clearlyBrighter = sample({ id: 2, intensity: 4 })
    const taken = assignVfxLightSlots([incumbent, clearlyBrighter], EYE, 1, new Map([[1, 0]]))
    expect([...taken.keys()]).toEqual([2])
  })

  it('reuses the lamp an evicted light gives up', () => {
    const assignment = assignVfxLightSlots(
      [sample({ id: 1, intensity: 9 }), sample({ id: 3, intensity: 5 })],
      EYE,
      2,
      new Map([[1, 0], [2, 1]]),
    )
    expect(assignment.get(1)).toBe(0)
    expect(assignment.get(3)).toBe(1)
  })

  it('hands out nothing when the scene mounted no pool', () => {
    expect(assignVfxLightSlots([sample({ id: 1 })], EYE, 0, new Map()).size).toBe(0)
  })
})
