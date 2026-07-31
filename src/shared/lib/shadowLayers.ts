import type { Object3D } from 'three'

/**
 * Static/dynamic shadow convention.
 *
 * Layer 0 stays enabled on EVERY object — that's the layer the main camera and
 * the shadow camera render by default, so tagging never hides anything and does
 * not change the main render. The extra layers label shadow casters so the
 * cached-shadow rig can render them in separate passes:
 *
 *   - `static`  casters → rendered into the shadow map ONCE and cached (the world
 *                         geometry: buildings, terrain, ruins — never moves).
 *   - `dynamic` casters → re-rendered into that cached map each frame
 *                         (players, monsters, projectiles — the moving stuff).
 *
 * `staticCaster` and `dynamicCaster` are DERIVED, never authored: the rig
 * recomputes them from `castShadow` plus the tag, because its two passes are
 * ordinary renders and an ordinary render has no `castShadow` filter of its own.
 * Anything untagged counts as dynamic — the safe default, since it keeps casting
 * a shadow, just at the cost of a redraw.
 *
 * `ShadowCompositor` renders the static set into a cached depth target once, then
 * per frame blits that cache into a scratch map, draws the dynamic set on top and
 * blits the result home — the classic engine "cached shadow map" split (Unreal) /
 * shadowmask (Unity).
 */
export const SHADOW_LAYER = {
  static: 1,
  dynamic: 2,
  dynamicCaster: 3,
  staticCaster: 4,
} as const

export const SHADOW_LAYER_MASK = {
  static: 1 << SHADOW_LAYER.static,
  dynamic: 1 << SHADOW_LAYER.dynamic,
  dynamicCaster: 1 << SHADOW_LAYER.dynamicCaster,
  staticCaster: 1 << SHADOW_LAYER.staticCaster,
} as const

export type ShadowKind = 'static' | 'dynamic'

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

export type ShadowCasters = {
  /** The movers, redrawn into the shadow map every frame. */
  readonly dynamic: Object3D[]
  /** The world, drawn into the cache when it is baked. */
  readonly static: Object3D[]
}

type Renderable = Object3D & {
  readonly isLight?: boolean
  readonly isLine?: boolean
  readonly isMesh?: boolean
  readonly isPoints?: boolean
}

/**
 * Split the scene's shadow casters into the world and the movers, tagging the
 * movers with the derived `dynamicCaster` layer on the way through. Cheap enough
 * to run on an interval: one traverse plus a bitmask write. Run it often enough
 * that a freshly spawned enemy starts casting within a few frames.
 */
export function collectShadowCasters(root: Object3D): ShadowCasters {
  const dynamic: Object3D[] = []
  const staticCasters: Object3D[] = []

  root.traverse((obj) => {
    const renderable = obj as Renderable
    // Lights ride along in both caster layers. They cast nothing, but a render
    // that cannot SEE them builds a light state with none in it, and three's
    // light uniforms — the shadow map samplers among them — are shared across
    // renders: the next frame would draw with a shadow sampler pointing at
    // nothing and the driver would drop every shadowed surface in the world.
    if (renderable.isLight === true) {
      obj.layers.enable(SHADOW_LAYER.dynamicCaster)
      obj.layers.enable(SHADOW_LAYER.staticCaster)
      return
    }

    if (renderable.isMesh !== true && renderable.isLine !== true && renderable.isPoints !== true) return

    const isStatic = obj.userData.shadowKind === 'static'
    if (!obj.castShadow) {
      obj.layers.disable(SHADOW_LAYER.dynamicCaster)
      obj.layers.disable(SHADOW_LAYER.staticCaster)
      return
    }

    obj.layers.enable(isStatic ? SHADOW_LAYER.staticCaster : SHADOW_LAYER.dynamicCaster)
    obj.layers.disable(isStatic ? SHADOW_LAYER.dynamicCaster : SHADOW_LAYER.staticCaster)
    ;(isStatic ? staticCasters : dynamic).push(obj)
  })

  return { dynamic, static: staticCasters }
}
