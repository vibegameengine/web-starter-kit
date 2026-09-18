import { describe, expect, it } from 'vitest'

import { pivotAroundBall } from './ballPivot'

describe('pivotAroundBall', () => {
  const pinned: [number, number, number] = [0.1, 0.03, 0.7]

  it('stands the ankle over the pinned ball the way the clip holds it', () => {
    const ankle = pivotAroundBall(pinned, [0, 0.1, 0.5], [0, 0.03, 0.62])
    expect(ankle[0]).toBeCloseTo(0.1, 9)
    expect(ankle[1]).toBeCloseTo(0.1, 9)
    expect(ankle[2]).toBeCloseTo(0.58, 9)
  })

  /* @important This is what the stance used to get wrong: the clip lifts the
     heel at the end of a stride, and the whole foot was held in place and rose
     with it — toe and all, 15 cm clear of the tread it was meant to be standing
     on. Pinning the ball instead keeps the toe down and lets the heel rise
     round it, which is Unreal's GetFootPivotAroundBallWS. */
  it('lets the heel rise round the ball while the ball stays down', () => {
    const flat = pivotAroundBall(pinned, [0, 0.1, 0.5], [0, 0.03, 0.62])
    const lifted = pivotAroundBall(pinned, [0, 0.16, 0.54], [0, 0.03, 0.62])
    expect(lifted[1]).toBeGreaterThan(flat[1])
  })

  it('ignores where the clip has carried the foot, keeping the ball where it was planted', () => {
    const here = pivotAroundBall(pinned, [0, 0.1, 0.5], [0, 0.03, 0.62])
    const carried = pivotAroundBall(pinned, [0.3, 0.1, 1.5], [0.3, 0.03, 1.62])
    expect(carried[0]).toBeCloseTo(here[0], 9)
    expect(carried[2]).toBeCloseTo(here[2], 9)
  })
})
