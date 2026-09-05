/**
 * Which VFX lights get one of the pool's real lamps this frame.
 *
 * This is the system half of the VFX light rig (`VfxLights.tsx` is the React
 * half): pure numbers in, a slot assignment out, no three and no React, so the
 * rule that decides what the player sees lit is unit-testable on its own.
 *
 * The pool is small and permanent — that is the entire point of it, see
 * `VfxLights.tsx` — so on a busy frame there are more lights wanted than lamps
 * to give out, and something has to lose. Two rules decide it:
 *
 *   1. `priority` first, absolutely. A muzzle flash is the light the shot is
 *      made of; it must never lose its lamp to six rockets across the arena.
 *   2. Then apparent brightness from where the camera stands, so the light the
 *      player can actually see wins over the brighter one behind them.
 */

/** One light a VFX wants this frame, in WORLD space. */
export interface VfxLightSample {
  /** Falloff radius in metres. 0 means "no falloff", as on `PointLight`. */
  readonly distance: number
  readonly id: number
  readonly intensity: number
  /** Higher wins outright. Reserve >0 for lights the shot is made of. */
  readonly priority: number
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface VfxLightViewpoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The radius an unbounded light is ranked at.
 *
 * `distance = 0` is three's "reaches forever", which as a score would be
 * infinity and would beat every bounded light in the arena regardless of where
 * it is. Ranked as a big-but-finite arena-sized radius instead, so an unbounded
 * light still loses to a bright one right in front of the lens.
 */
const UNBOUNDED_RADIUS_METERS = 64

/**
 * How much better a challenger has to be to take a lamp off the light holding it.
 *
 * Without it, two lights of near-equal score swap the lamp every frame as the
 * camera drifts, and swapping is visible: the colours cross-fade through each
 * other. A quarter again is enough to keep a tie stable and small enough that a
 * genuinely brighter light still takes the lamp immediately.
 */
const INCUMBENT_BONUS = 1.25

/**
 * How brightly this light reads from the viewpoint.
 *
 * Not the physical falloff at the camera — a light is judged by the SURFACES it
 * lights, and standing outside its sphere does not make it invisible, it makes
 * it small. So the term is how much of the view its lit sphere can occupy:
 * inside the sphere it is everything (1), outside it falls off with distance.
 */
export function vfxLightScore(sample: VfxLightSample, viewpoint: VfxLightViewpoint): number {
  if (sample.intensity <= 0) return 0
  const radius = sample.distance > 0 ? sample.distance : UNBOUNDED_RADIUS_METERS
  const dx = sample.x - viewpoint.x
  const dy = sample.y - viewpoint.y
  const dz = sample.z - viewpoint.z
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return sample.intensity * (radius / Math.max(radius, range))
}

/**
 * Hand out `slotCount` lamps to the lights that deserve them.
 *
 * `previous` is last frame's assignment and does two jobs: it is the incumbency
 * the hysteresis above is measured on, and it lets a light that keeps its lamp
 * keep the SAME lamp — a light that hops from lamp 2 to lamp 5 writes its colour
 * over whatever lamp 5 was lighting, for one frame, in the middle of the arena.
 */
export function assignVfxLightSlots(
  samples: readonly VfxLightSample[],
  viewpoint: VfxLightViewpoint,
  slotCount: number,
  previous: ReadonlyMap<number, number>,
): Map<number, number> {
  const winners = samples
    .map((sample) => ({
      id: sample.id,
      priority: sample.priority,
      score: vfxLightScore(sample, viewpoint) * (previous.has(sample.id) ? INCUMBENT_BONUS : 1),
    }))
    .filter((candidate) => candidate.score > 0)
    // `id` last so the order is total: ids only ever grow, so an exact tie is
    // broken towards the older light and the picture does not shimmer.
    .sort((a, b) => b.priority - a.priority || b.score - a.score || a.id - b.id)
    .slice(0, Math.max(0, slotCount))

  const assignment = new Map<number, number>()
  const taken = new Set<number>()

  for (const winner of winners) {
    const held = previous.get(winner.id)
    if (held === undefined || held >= slotCount || taken.has(held)) continue
    assignment.set(winner.id, held)
    taken.add(held)
  }

  let free = 0
  for (const winner of winners) {
    if (assignment.has(winner.id)) continue
    while (taken.has(free)) free += 1
    assignment.set(winner.id, free)
    taken.add(free)
  }

  return assignment
}
