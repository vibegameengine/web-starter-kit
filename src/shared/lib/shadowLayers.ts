import type { Object3D } from 'three'

/**
 * Static/dynamic shadow convention.
 *
 * Layer 0 stays enabled on EVERY object — that's the layer the main camera and
 * the shadow camera render by default, so tagging never hides anything and does
 * not change the current render. These extra layers only LABEL shadow casters so
 * a future shadow system can render them separately:
 *
 *   - `static`  casters → rendered into the shadow map ONCE and cached (the world
 *                         geometry: buildings, terrain, ruins — never moves).
 *   - `dynamic` casters → re-rendered (throttled) into that cached map each frame
 *                         (players, monsters, projectiles — the moving stuff).
 *
 * The future system will do `light.shadow.camera.layers.set(SHADOW_LAYER.static)`
 * to render only the static set once, cache that depth, then per frame reset to
 * the cache and render only `SHADOW_LAYER.dynamic` on top — the classic engine
 * "cached shadow map" split (Unreal) / shadowmask (Unity).
 *
 * Until that exists the tags are inert.
 */
export const SHADOW_LAYER = {
  static: 1,
  dynamic: 2,
} as const

export type ShadowKind = keyof typeof SHADOW_LAYER

/**
 * Tag an object and its whole subtree as a static or dynamic shadow caster.
 * Use imperatively when spawning objects from code (e.g. a monster on spawn),
 * or via the <ShadowGroup> wrapper in JSX.
 */
export function tagShadowKind(root: Object3D, kind: ShadowKind): void {
  const layer = SHADOW_LAYER[kind]
  root.traverse((obj) => {
    obj.layers.enable(layer)
    obj.userData.shadowKind = kind
  })
}
