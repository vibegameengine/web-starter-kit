import { describe, expect, it } from 'vitest'

import { damperImplicit, followedRootHeight, ROOT_HEIGHT_HALFLIFE, ROOT_HEIGHT_MAX_ERROR } from './rootOffset'

const STEP = 1 / 60

describe('damperImplicit', () => {
  it('covers half the distance in one half-life', () => {
    let remaining = 1
    const steps = Math.round(ROOT_HEIGHT_HALFLIFE / STEP)
    for (let index = 0; index < steps; index += 1) remaining *= 1 - damperImplicit(ROOT_HEIGHT_HALFLIFE, STEP)
    expect(remaining).toBeCloseTo(0.5, 1)
  })

  it('does not care how the time is sliced', () => {
    const whole = 1 - damperImplicit(0.2, 0.1)
    const halves = (1 - damperImplicit(0.2, 0.05)) ** 2
    expect(halves).toBeCloseTo(whole, 3)
  })

  it('never answers past one, even for a half-life shorter than the frame', () => {
    expect(damperImplicit(0.001, 0.1)).toBeLessThanOrEqual(1)
  })
})

describe('followedRootHeight', () => {
  /* @important The capsule climbs a stair in a single tick, and the mesh drawn
     on it jumped with it — hips and all — which put the foot still standing on
     the lower tread out of the leg's reach. Unreal's OffsetRootBone keeps the
     root where it was and lets it catch the capsule up over a half-life; this is
     that, for height only, because every clip here is in place and a root that
     lagged horizontally would trail the capsule by a quarter of a metre at a
     walk. */
  it('does not jump when the capsule steps up', () => {
    const after = followedRootHeight(0, 0.15, STEP)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(0.15 * 0.3)
  })

  it('catches the capsule up within a few half-lives', () => {
    let root = 0
    for (let index = 0; index < 60; index += 1) root = followedRootHeight(root, 0.15, STEP)
    expect(root).toBeCloseTo(0.15, 3)
  })

  it('never lets the root fall further behind than its limit', () => {
    const after = followedRootHeight(0, 2, STEP)
    expect(2 - after).toBeLessThanOrEqual(ROOT_HEIGHT_MAX_ERROR + 1e-9)
  })

  it('follows a step down as smoothly as a step up', () => {
    const after = followedRootHeight(0.15, 0, STEP)
    expect(after).toBeLessThan(0.15)
    expect(after).toBeGreaterThan(0.15 * 0.7)
  })
})
