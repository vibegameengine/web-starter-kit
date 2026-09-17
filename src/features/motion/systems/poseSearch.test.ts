import { describe, expect, it } from 'vitest'

import { DEFAULT_SWITCH_PENALTY, findBestPose, poseAfter, poseCost, type PoseDatabase } from './poseSearch'

const DATABASE: PoseDatabase = {
  dimensions: 3,
  poses: [
    { clipId: 'walk', features: [0, 0, 0], time: 0 },
    { clipId: 'walk', features: [1, 0, 0], time: 0.1 },
    { clipId: 'walk', features: [2, 0, 0], time: 0.2 },
    { clipId: 'run', features: [10, 0, 0], time: 0 },
    { clipId: 'run', features: [11, 0, 0], time: 0.1 },
  ],
  sampleHz: 10,
  trajectoryOffsets: [0.2],
  weights: [1, 1, 1],
}

describe('poseCost', () => {
  it('is zero for the same pose', () => {
    expect(poseCost([1, 2, 3], [1, 2, 3], [1, 1, 1])).toBe(0)
  })

  it('weights each dimension', () => {
    expect(poseCost([0, 0, 0], [1, 0, 0], [4, 1, 1])).toBeCloseTo(2, 6)
    expect(poseCost([0, 0, 0], [0, 1, 0], [4, 1, 1])).toBeCloseTo(1, 6)
  })

  it('refuses vectors of different lengths rather than comparing part of them', () => {
    expect(() => poseCost([1, 2], [1, 2, 3], [1, 1, 1])).toThrow(/matching lengths/)
  })
})

describe('findBestPose', () => {
  it('finds the nearest pose in the whole database', () => {
    const match = findBestPose(DATABASE, [10.4, 0, 0], { switchPenalty: 0 })

    expect(match.clipId).toBe('run')
    expect(match.time).toBe(0)
  })

  it('holds the pose it is already playing when the alternative is barely better', () => {
    const continuing = { clipId: 'walk', cost: 0, index: 1, time: 0.1 }
    const match = findBestPose(DATABASE, [1.2, 0, 0], { continuing })

    expect(match.clipId).toBe('walk')
    expect(match.time).toBe(0.1)
  })

  it('switches when the alternative is better than the penalty', () => {
    const continuing = { clipId: 'walk', cost: 0, index: 1, time: 0.1 }
    const match = findBestPose(DATABASE, [10, 0, 0], { continuing })

    expect(match.clipId).toBe('run')
  })

  it('charges the penalty to every pose but the one being played', () => {
    const continuing = { clipId: 'walk', cost: 0, index: 0, time: 0 }
    const match = findBestPose(DATABASE, [0.5, 0, 0], { continuing, switchPenalty: DEFAULT_SWITCH_PENALTY })

    expect(match.index).toBe(0)
    expect(match.cost).toBeCloseTo(0.5, 6)
  })

  it('refuses an empty database instead of answering from nothing', () => {
    expect(() => findBestPose({ ...DATABASE, poses: [] }, [0, 0, 0])).toThrow(/empty/)
  })
})

describe('poseAfter', () => {
  it('advances within the same clip', () => {
    const match = poseAfter(DATABASE, { clipId: 'walk', cost: 0, index: 0, time: 0 }, 0.2)

    expect(match.index).toBe(2)
    expect(match.time).toBeCloseTo(0.2, 6)
  })

  it('stops at the clip end rather than walking into the next clip', () => {
    const match = poseAfter(DATABASE, { clipId: 'walk', cost: 0, index: 2, time: 0.2 }, 0.5)

    expect(match.clipId).toBe('walk')
    expect(match.index).toBe(2)
  })
})
