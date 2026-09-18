import { describe, expect, it } from 'vitest'

import { crossingRelease, mutualSeparation, RESTING_SEPARATION, SEPARATING_DISTANCE, springSeparation } from './footSeparation'

const SIDE: [number, number] = [1, 0]

function feet(animated: [number, number], solved: [number, number], holds: [number, number]) {
  return {
    animated: [[animated[0], 0], [animated[1], 0]] as const,
    holds,
    side: SIDE,
    solved: [[solved[0], 0], [solved[1], 0]] as const,
  }
}

describe('mutualSeparation', () => {
  it('leaves feet alone that are as far apart as the clip had them', () => {
    const [left, right] = mutualSeparation(feet([0.1, -0.1], [0.1, -0.1], [0, 1]))
    expect(left[0]).toBeCloseTo(0, 9)
    expect(right[0]).toBeCloseTo(0, 9)
  })

  /* @important Unreal's SeparatingDistance puts its plane at the midpoint of
     the ANIMATED feet, which cannot see a planted foot the body has walked
     away from: that foot is still locked where it landed, and a swing foot
     kept on its own side of the animated midpoint walks straight into it. So
     the plane is taken from where the other foot actually is, and the foot
     that is free to move is the one moved. */
  it('moves the free foot away from where a planted foot actually stands', () => {
    const [left, right] = mutualSeparation(feet([0.1, -0.1], [0.1, 0.12], [0, 1]))
    expect(right[0]).toBeCloseTo(0, 9)
    expect(0.1 + left[0] - 0.12).toBeCloseTo(2 * SEPARATING_DISTANCE, 9)
  })

  it('never narrows the feet past the clip, and never widens them past the separating distance', () => {
    const [left] = mutualSeparation(feet([0.04, -0.03], [0.0, -0.03], [0, 1]))
    expect(0.0 + left[0] + 0.03).toBeCloseTo(0.07, 9)
  })

  it('does not fight a clip that crosses the feet itself', () => {
    const [left, right] = mutualSeparation(feet([-0.05, 0.05], [-0.05, 0.05], [0, 1]))
    expect(left[0]).toBeCloseTo(0, 9)
    expect(right[0]).toBeCloseTo(0, 9)
  })

  it('shares the push between two feet in the air', () => {
    const [left, right] = mutualSeparation(feet([0.1, -0.1], [0, 0], [0, 0]))
    expect(left[0]).toBeCloseTo(SEPARATING_DISTANCE, 9)
    expect(right[0]).toBeCloseTo(-SEPARATING_DISTANCE, 9)
  })

  it('moves neither foot while both are planted', () => {
    const [left, right] = mutualSeparation(feet([0.1, -0.1], [0, 0], [1, 1]))
    expect(left[0]).toBeCloseTo(0, 9)
    expect(right[0]).toBeCloseTo(0, 9)
  })
})

describe('springSeparation', () => {
  /* @important Unreal springs the separating offset with the floor spring
     rather than writing it outright, so a foot that meets the plane is eased
     back instead of snapping — a snap there is the micro-jerk the eye catches
     first. */
  it('eases toward the wanted offset instead of snapping', () => {
    const first = springSeparation(RESTING_SEPARATION, [0.07, 0], 1 / 60)
    expect(first.offset[0]).toBeGreaterThan(0)
    expect(first.offset[0]).toBeLessThan(0.07)
  })

  it('settles on the wanted offset', () => {
    let state = RESTING_SEPARATION
    for (let frame = 0; frame < 120; frame += 1) state = springSeparation(state, [0.07, 0], 1 / 60)
    expect(state.offset[0]).toBeCloseTo(0.07, 3)
  })
})

/* @important Mutual placement's other half. Separating can only move a foot
   that is free; a foot still locked to the ground that the body has carried in
   under the other leg is let go instead — the one of the two that the lock has
   dragged furthest inward from where the clip has it — and Unreal's unplant
   then eases it back onto the clip. */
describe('crossingRelease', () => {
  it('releases nothing while the feet are as far apart as the clip had them', () => {
    expect(crossingRelease(feet([0.1, -0.1], [0.1, -0.1], [1, 1]))).toEqual([false, false])
  })

  it('releases the locked foot the body has carried across the other leg', () => {
    expect(crossingRelease(feet([0.1, -0.1], [0.1, 0.12], [1, 1]))).toEqual([false, true])
    expect(crossingRelease(feet([0.1, -0.1], [-0.12, -0.1], [1, 1]))).toEqual([true, false])
  })

  it('releases the dragged locked foot even while the other foot is free', () => {
    expect(crossingRelease(feet([0.1, -0.1], [0.1, 0.12], [0, 1]))).toEqual([false, true])
  })

  it('keeps a lock that has drifted inward by less than the separating distance', () => {
    expect(crossingRelease(feet([0.04, -0.04], [0.04, -0.01], [1, 1]))).toEqual([false, false])
  })

  it('never releases a foot that is not locked, which separation moves instead', () => {
    expect(crossingRelease(feet([0.1, -0.1], [-0.12, -0.1], [0, 1]))).toEqual([false, false])
  })
})
