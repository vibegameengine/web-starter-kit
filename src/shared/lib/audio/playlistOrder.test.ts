import { describe, expect, it } from 'vitest'

import { advancePlaylist, createPlaylistState } from './playlistOrder'
import type { PlaylistState } from './playlistOrder'

/**
 * The two properties worth pinning are the ones a naive random picker fails:
 * every track is heard before any is heard twice, and no track ever follows
 * itself — including across the seam where one shuffle ends and the next begins,
 * which is the only place a bag can repeat and the place it is most audible.
 */

/** Plays `count` tracks and returns the indices in order. */
function play(state: PlaylistState, count: number, random = Math.random) {
  const played: number[] = []
  let current = state
  for (let step = 0; step < count; step += 1) {
    const advance = advancePlaylist(current, random)
    current = advance.state
    if (advance.trackIndex !== null) played.push(advance.trackIndex)
  }
  return played
}

describe('advancePlaylist', () => {
  it('plays every track once before repeating any', () => {
    const played = play(createPlaylistState(3), 3)
    expect([...played].sort()).toEqual([0, 1, 2])
  })

  it('never plays a track twice in a row, across many refills', () => {
    // 400 plays over a 3-track bag is ~133 seam crossings — the constraint has
    // to hold at every one of them, not on average.
    const played = play(createPlaylistState(3), 400)
    expect(played).toHaveLength(400)
    for (let index = 1; index < played.length; index += 1) {
      expect(played[index]).not.toBe(played[index - 1])
    }
  })

  it('keeps each track within one bag-length of every other', () => {
    // The complaint a bag exists to prevent: one track going unheard for ages.
    const played = play(createPlaylistState(3), 300)
    const counts = [0, 0, 0]
    for (const index of played) counts[index] += 1
    for (const count of counts) expect(count).toBe(100)
  })

  it('walks sequentially and wraps when shuffle is off', () => {
    const played = play(createPlaylistState(3, false), 7)
    expect(played).toEqual([0, 1, 2, 0, 1, 2, 0])
  })

  it('repeats a single track rather than getting stuck', () => {
    // There is nowhere else for a one-track bag to go; silence would be a bug.
    expect(play(createPlaylistState(1), 3)).toEqual([0, 0, 0])
  })

  it('reports nothing to play for an empty playlist', () => {
    const advance = advancePlaylist(createPlaylistState(0))
    expect(advance.trackIndex).toBeNull()
    expect(advance.state.order).toEqual([])
  })

  it('survives a random source pinned at its extremes', () => {
    // `Math.random()` is documented as [0, 1); a stub handing back exactly 1 must
    // not index off the end of the order.
    for (const roll of [() => 0, () => 0.999999999, () => 1]) {
      const played = play(createPlaylistState(4, true, roll), 20, roll)
      expect(played).toHaveLength(20)
      for (const index of played) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(4)
      }
    }
  })

  it('does not mutate the state it was given', () => {
    const state = createPlaylistState(3)
    const before = { cursor: state.cursor, order: [...state.order] }
    advancePlaylist(state)
    expect(state.cursor).toBe(before.cursor)
    expect([...state.order]).toEqual(before.order)
  })
})
