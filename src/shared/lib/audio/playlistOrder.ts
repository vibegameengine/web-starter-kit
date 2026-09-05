/**
 * What plays next.
 *
 * The obvious implementation — pick a track at random each time — is the one
 * players complain about: with three tracks it repeats the one just heard a
 * third of the time, and one track in the set can go unheard for a quarter of an
 * hour. So this is a SHUFFLE BAG. Every track is drawn once before any is drawn
 * again, and each fresh shuffle is prevented from opening with the track that
 * closed the last one, which is the only place a bag can still repeat.
 *
 * Sequential order is the same machine with the shuffle switched off, so both
 * modes advance, wrap and resume through one code path.
 *
 * Pure and framework-free: the caller supplies the random source, so the order
 * is exhaustively testable and can be made deterministic by handing it a seeded
 * one.
 */

/** A source of numbers in `[0, 1)` — `Math.random` in the game, a stub in specs. */
export type RandomSource = () => number

export type PlaylistState = {
  /** Track indices in the order they will play. */
  readonly order: readonly number[]
  /** How far into `order` the playhead is. */
  readonly cursor: number
  readonly shuffle: boolean
}

export type PlaylistAdvance = {
  /** The track to play now, or `null` for an empty playlist. */
  readonly trackIndex: number | null
  readonly state: PlaylistState
}

/**
 * Fisher–Yates, with one constraint: `avoidFirst` must not land at the front.
 *
 * That constraint is the whole reason this is not `array.sort(() => …)`. Without
 * it a bag repeats exactly once per cycle, at the seam — which is the moment a
 * listener is most likely to notice, because they have just heard every other
 * track in between.
 */
function shuffled(count: number, avoidFirst: number | null, random: RandomSource): number[] {
  const order = Array.from({ length: count }, (_unused, index) => index)
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.min(0.999999, Math.max(0, random())) * (index + 1))
    const held = order[index] as number
    order[index] = order[swap] as number
    order[swap] = held
  }
  // With a single track there is nowhere to move it to, and a one-track bag
  // repeating itself is not a defect — it is the only thing it can do.
  if (count > 1 && avoidFirst !== null && order[0] === avoidFirst) {
    const held = order[0] as number
    order[0] = order[count - 1] as number
    order[count - 1] = held
  }
  return order
}

export function createPlaylistState(
  trackCount: number,
  shuffle = true,
  random: RandomSource = Math.random,
): PlaylistState {
  const count = Math.max(0, Math.floor(trackCount))
  const order = shuffle
    ? shuffled(count, null, random)
    : Array.from({ length: count }, (_unused, index) => index)
  return { cursor: 0, order, shuffle }
}

/**
 * Takes the next track out of the bag, refilling it when it runs dry.
 *
 * Returns the state to keep AND the track to play, rather than mutating: the
 * caller is a React entity that has to be able to drop the result if it
 * unmounted while a track was loading.
 */
export function advancePlaylist(
  previous: Readonly<PlaylistState>,
  random: RandomSource = Math.random,
): PlaylistAdvance {
  if (previous.order.length === 0) return { state: previous, trackIndex: null }

  if (previous.cursor < previous.order.length) {
    return {
      state: { ...previous, cursor: previous.cursor + 1 },
      trackIndex: previous.order[previous.cursor] as number,
    }
  }

  const last = previous.order[previous.order.length - 1] as number
  const order = previous.shuffle
    ? shuffled(previous.order.length, last, random)
    : [...previous.order]
  return { state: { ...previous, cursor: 1, order }, trackIndex: order[0] as number }
}
