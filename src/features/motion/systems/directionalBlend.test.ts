import { describe, expect, it } from 'vitest'

import { directionalBlend, WALK_DIRECTIONS, withSpeeds } from './directionalBlend'

const SPEEDS: Record<string, number> = {
  'walk-backward': 1.089,
  'walk-forward': 1.633,
  'walk-strafe-left': 0.576,
  'walk-strafe-right': 0.576,
}

const WALK = withSpeeds(WALK_DIRECTIONS, (clipId) => SPEEDS[clipId] ?? 0)

describe('directionalBlend', () => {
  it('plays one clip when travel matches a clip exactly', () => {
    const blend = directionalBlend(0, WALK)

    expect(blend.clips).toEqual([{ clipId: 'walk-forward', weight: 1 }])
    expect(blend.speed).toBeCloseTo(1.633, 3)
  })

  it('splits a diagonal evenly between the two clips beside it', () => {
    const blend = directionalBlend(Math.PI / 4, WALK)

    expect(blend.clips.map((clip) => clip.clipId)).toEqual(['walk-forward', 'walk-strafe-right'])
    expect(blend.clips[0].weight).toBeCloseTo(0.5, 6)
    expect(blend.clips[1].weight).toBeCloseTo(0.5, 6)
  })

  it('blends the speed with the clips, so a diagonal is priced between them', () => {
    const blend = directionalBlend(Math.PI / 4, WALK)

    expect(blend.speed).toBeCloseTo((1.633 + 0.576) / 2, 3)
  })

  it('leans toward the nearer clip', () => {
    const blend = directionalBlend(Math.PI / 8, WALK)

    expect(blend.clips[0].clipId).toBe('walk-forward')
    expect(blend.clips[0].weight).toBeCloseTo(0.75, 6)
  })

  it('weights always sum to one, at every angle', () => {
    for (let angle = -Math.PI; angle <= Math.PI; angle += Math.PI / 12) {
      const total = directionalBlend(angle, WALK).clips.reduce((sum, clip) => sum + clip.weight, 0)
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('picks the left strafe for leftward travel and the right one for rightward', () => {
    expect(directionalBlend(-Math.PI / 2, WALK).clips[0].clipId).toBe('walk-strafe-left')
    expect(directionalBlend(Math.PI / 2, WALK).clips[0].clipId).toBe('walk-strafe-right')
  })

  it('refuses an empty set instead of inventing a clip', () => {
    expect(() => directionalBlend(0, [])).toThrow(/at least one clip/)
  })
})
