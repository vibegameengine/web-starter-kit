/**
 * Invalidation contract for the baked static shadow map.
 *
 * ShadowCompositor bakes the static map once and then trusts the
 * world not to change. Anything that DOES change static geometry — a door
 * opening, an arena seal shattering, a new dungeon generating — must call
 * `invalidateStaticShadows()`. The rig polls the version each frame and
 * schedules a re-bake a few frames later (deferred so the bake never lands on
 * the same frame as the combat event that triggered it).
 *
 * Per-frame mutations that do NOT belong here: the occluder fade (columns
 * turning translucent while blocking the camera) never reaches the shadow
 * pass — three's depth material ignores the instanceOpacity attribute — so
 * fading was never shadowed and needs no invalidation. Wiring fade to this
 * store would re-bake the full static map every frame.
 */

let version = 0

/** Call when static shadow-casting geometry changed (door, seal, new layout). */
export function invalidateStaticShadows(): void {
  version += 1
}

/** Monotonic counter the shadow rig polls to detect pending re-bakes. */
export function staticShadowsVersion(): number {
  return version
}
