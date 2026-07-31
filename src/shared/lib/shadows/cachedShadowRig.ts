import {
  BackSide,
  DepthFormat,
  DepthTexture,
  DoubleSide,
  FrontSide,
  LessEqualCompare,
  MeshDepthMaterial,
  NearestFilter,
  UnsignedIntType,
  Vector3,
  VSMShadowMap,
  WebGLRenderTarget,
} from 'three'
import type { DirectionalLight, Material, Mesh, Object3D, RenderTarget, Scene, WebGLRenderer } from 'three'

import { collectShadowCasters, SHADOW_LAYER_MASK } from '../shadowLayers'
import { staticShadowsVersion } from './shadowInvalidation'

/**
 * The cached shadow map: render the world's shadows once, redraw only what moves.
 *
 * A shadow map is a full extra render of every caster in the scene, and three.js
 * does it every frame. But a raid map is ~99% static — terrain, village, farm,
 * trees — against one player and a handful of enemies. Re-rendering the whole
 * world to move one character's shadow is the waste this rig removes.
 *
 *   BAKE     — the static casters' depth, drawn into a cache of our own. Rare:
 *              only when the sun's box moves, the world changes, or streamed
 *              geometry arrives.
 *   COMPOSE  — every frame: blit the cache into a scratch map, draw the movers
 *              on top, blit the result into the live map. One GPU copy each way
 *              and a handful of characters, instead of a world.
 *
 * Both passes are ordinary renders into targets nothing is sampling, and the
 * live map is only ever written by a blit. That ordering is not incidental:
 *
 *  - Drawing straight into the live map makes the driver drop every
 *    shadow-reading draw on screen — its depth texture is bound to all of them —
 *    which looks like the world vanishing while the grass stays.
 *  - Handing the bake to three's own shadow pass means the live map spends that
 *    frame holding the world without the movers, and the player's shadow blinks
 *    once per bake.
 *
 * The rig degrades instead of breaking: no sun, more than one shadow-casting
 * light, VSM shadows, or a scene with nothing tagged static all fall back to
 * plain throttled updates.
 */

/** How often the caster sets are recollected, in frames. */
const REFRESH_INTERVAL = 10

/** Frames of ordinary three shadow passes before the rig takes over. */
const WARMUP_FRAMES = 4

/** Fallback reason that is permanent: this renderer cannot cache shadows at all. */
const UNSUPPORTED = 'renderer cannot copy shadow depth'

/** three's own rule: a front-faced material casts from its back faces. */
const SHADOW_SIDE = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide }

type RenderTargetProperties = {
  __webglFramebuffer?: WebGLFramebuffer | WebGLFramebuffer[] | null
}

type CachedShadowStats = {
  /** How many times the whole static world was re-rendered since mount. */
  readonly bakes: number
  readonly dynamicCasters: number
  readonly mode: 'cached' | 'fallback'
  readonly staticCasters: number
}

type DepthCaster = Mesh & { customDepthMaterial?: Material }

function findShadowCastingSuns(scene: Scene): DirectionalLight[] {
  const found: DirectionalLight[] = []
  scene.traverse((obj: Object3D) => {
    const light = obj as DirectionalLight
    if (light.isDirectionalLight === true && light.castShadow && light.shadow) found.push(light)
  })
  return found
}

export class CachedShadowRig {
  private bakeCount = 0
  private baked = false
  private bakedPosition = new Vector3()
  private bakedStaticCount = -1
  private bakedTarget = new Vector3()
  private bakedVersion = -1
  private blitVerified = false
  private cache: WebGLRenderTarget | null = null
  private casters = { dynamic: [] as Object3D[], static: [] as Object3D[] }
  /** Depth stand-ins keyed by the material they replace, built once per material. */
  private depthMaterials = new Map<Material, MeshDepthMaterial>()
  private fallbackReason: string | null = null
  private frame = 0
  /** One depth material per side for everything that does not cut itself out. */
  private plainDepth = new Map<number, MeshDepthMaterial>()
  private spare: WebGLRenderTarget | null = null
  private sun: DirectionalLight | null = null
  private swapped: { material: Material | Material[]; mesh: DepthCaster }[] = []

  /**
   * Drive one frame. `every` throttles the compose pass the same way the old
   * whole-map throttle did — the expensive static half is cached regardless.
   */
  update(renderer: WebGLRenderer, scene: Scene, every: number): void {
    this.frame += 1

    const light = this.pick(renderer, scene)
    if (!light) {
      this.throttle(renderer, every)
      return
    }

    if (this.frame % REFRESH_INTERVAL === 1) {
      this.casters = collectShadowCasters(scene)
    }

    if (this.casters.static.length === 0) {
      // Nothing tagged static — caching would save nothing, and every caster
      // still needs its shadow. Behave like the plain throttle.
      this.note('no static casters tagged')
      this.throttle(renderer, every)
      return
    }

    if (light.shadow.map === null || this.frame < WARMUP_FRAMES) {
      // Start like the plain throttle: ordinary full passes. They build the map,
      // they make the first rendered frame complete, and they let three settle
      // its shadow type before the scene's materials finish compiling — a
      // material compiled too early declares the map as a plain sampler and the
      // driver rejects its draws until something recompiles it.
      renderer.shadowMap.needsUpdate = true
      return
    }

    renderer.shadowMap.needsUpdate = false
    if (!this.ensureTargets(renderer, light)) {
      this.disable(renderer, UNSUPPORTED)
      return
    }

    const rebaked = this.bakeIfNeeded(renderer, scene, light)
    // A scene where nothing moves is already done: the live map has held the
    // whole truth since the bake, and every later frame is free.
    if (!rebaked && (this.casters.dynamic.length === 0 || this.frame % every !== 0)) return

    this.compose(renderer, scene, light)
  }

  stats(): CachedShadowStats {
    return {
      bakes: this.bakeCount,
      dynamicCasters: this.casters.dynamic.length,
      mode: this.fallbackReason === null ? 'cached' : 'fallback',
      staticCasters: this.casters.static.length,
    }
  }

  dispose(): void {
    this.restoreMaterials()
    this.dropTargets()
    for (const material of new Set(this.depthMaterials.values())) material.dispose()
    this.depthMaterials.clear()
    this.plainDepth.clear()
    this.baked = false
    this.sun = null
  }

  /** The sun this rig caches, or null when the scene is not a fit for caching. */
  private pick(renderer: WebGLRenderer, scene: Scene): DirectionalLight | null {
    // A renderer that cannot do the depth copy never will; stop retrying it.
    if (this.fallbackReason === UNSUPPORTED) return null

    if (renderer.shadowMap.type === VSMShadowMap) {
      this.disable(renderer, UNSUPPORTED)
      return null
    }

    const known = this.sun
    if (known && known.parent !== null && known.castShadow) return known

    const suns = findShadowCastingSuns(scene)
    if (suns.length !== 1) {
      // Zero suns: nothing to cache. Two or more: each would need its own cache,
      // and a half-cached rig is worse than an honest throttle.
      this.note(suns.length === 0 ? 'no shadow-casting sun' : 'more than one shadow-casting light')
      return null
    }

    this.fallbackReason = null
    this.sun = suns[0]
    this.baked = false
    return suns[0]
  }

  private throttle(renderer: WebGLRenderer, every: number): void {
    renderer.shadowMap.needsUpdate = this.frame < 3 || this.frame % every === 0
  }

  private note(reason: string): void {
    this.fallbackReason = reason
  }

  private disable(renderer: WebGLRenderer, reason: string): void {
    if (this.fallbackReason !== reason && import.meta.env.DEV) {
      console.warn(`[shadows] cached shadows unavailable (${reason}); falling back to throttled updates`)
    }
    this.restoreMaterials()
    this.fallbackReason = reason
    this.baked = false
    renderer.shadowMap.needsUpdate = true
  }

  private needsBake(light: DirectionalLight): boolean {
    if (!this.baked) return true
    if (this.bakedVersion !== staticShadowsVersion()) return true
    if (this.bakedStaticCount !== this.casters.static.length) return true
    return (
      this.bakedPosition.distanceToSquared(light.position) > 1e-8 ||
      this.bakedTarget.distanceToSquared(light.target.position) > 1e-8
    )
  }

  /** Draw the world's depth into the cache. Nothing samples it, so nothing blinks. */
  private bakeIfNeeded(renderer: WebGLRenderer, scene: Scene, light: DirectionalLight): boolean {
    if (!this.needsBake(light)) return false

    // The sun was moved by an ordinary useFrame, before r3f rendered: the shadow
    // camera and the matrix the shaders project with both follow it from here.
    light.updateMatrixWorld(true)
    light.target.updateMatrixWorld(true)
    light.shadow.updateMatrices(light)

    const startedAt = import.meta.env.DEV ? performance.now() : 0
    this.renderDepth(renderer, scene, light, this.cache, SHADOW_LAYER_MASK.staticCaster, this.casters.static, true)
    if (import.meta.env.DEV) {
      // DEV ledger of every re-bake, for probes. A bake only happens when the
      // shadow box STEPS, and the box only steps when the anchor moves — so this
      // is a cost that exists exclusively while the player is walking, which is
      // exactly the shape of complaint a frame-time probe has to be able to
      // attribute. Submit time only: the GPU's own share is not visible from here.
      const global = globalThis as { __shadowBakes?: unknown[] }
      const log = global.__shadowBakes ?? (global.__shadowBakes = [])
      log.push({ atMs: startedAt, casters: this.casters.static.length, submitMs: performance.now() - startedAt })
    }

    this.baked = true
    this.bakeCount += 1
    this.bakedPosition.copy(light.position)
    this.bakedTarget.copy(light.target.position)
    this.bakedStaticCount = this.casters.static.length
    this.bakedVersion = staticShadowsVersion()
    return true
  }

  /** Cached world + movers on top, assembled aside and blitted into the live map. */
  private compose(renderer: WebGLRenderer, scene: Scene, light: DirectionalLight): void {
    const scratch = this.spare
    if (scratch === null || !this.blit(renderer, this.cache, scratch)) {
      this.disable(renderer, UNSUPPORTED)
      return
    }

    if (this.casters.dynamic.length > 0) {
      this.renderDepth(renderer, scene, light, scratch, SHADOW_LAYER_MASK.dynamicCaster, this.casters.dynamic, false)
    }

    if (!this.blit(renderer, scratch, light.shadow.map)) this.disable(renderer, UNSUPPORTED)
  }

  /**
   * One depth pass over a caster set, seen from the sun.
   *
   * The layer mask is what turns an ordinary render into a shadow pass over just
   * that set. Every caster wears a depth stand-in for the duration — its own
   * `customDepthMaterial` when it has one, so the vegetation's alpha-cut leaves
   * keep casting leaf-shaped shadows rather than slabs.
   */
  private renderDepth(
    renderer: WebGLRenderer,
    scene: Scene,
    light: DirectionalLight,
    target: WebGLRenderTarget | null,
    mask: number,
    casters: readonly Object3D[],
    clear: boolean,
  ): void {
    if (target === null) return

    const camera = light.shadow.camera
    const previousTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear
    const previousBackground = scene.background
    const previousOverride = scene.overrideMaterial
    const previousMask = camera.layers.mask

    // The bake swaps each caster for its own depth stand-in, so the vegetation's
    // alpha-cut leaves keep casting leaf-shaped shadows; it runs rarely enough to
    // afford the bookkeeping. The per-frame pass takes the cheap road instead —
    // one override material for the movers, who are solid bodies anyway.
    if (clear) this.applyDepthMaterials(casters)
    else scene.overrideMaterial = this.plainDepthMaterial()
    camera.layers.mask = mask
    // The background would draw a full-screen quad into the shadow map for
    // nothing, and drag the scene's tone mapping into a depth pass with it.
    scene.background = null
    renderer.autoClear = clear
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)

    renderer.setRenderTarget(previousTarget)
    renderer.autoClear = previousAutoClear
    scene.background = previousBackground
    scene.overrideMaterial = previousOverride
    camera.layers.mask = previousMask
    this.restoreMaterials()
    renderer.shadowMap.needsUpdate = false
  }

  /** The shared stand-in for anything that does not cut its own silhouette. */
  private plainDepthMaterial(): MeshDepthMaterial {
    const known = this.plainDepth.get(BackSide)
    if (known) return known
    const depth = new MeshDepthMaterial()
    depth.name = 'cachedShadowDepth'
    depth.side = BackSide
    this.plainDepth.set(BackSide, depth)
    return depth
  }

  private applyDepthMaterials(casters: readonly Object3D[]): void {
    for (const caster of casters) {
      const mesh = caster as DepthCaster
      const source = mesh.material
      // A multi-material mesh keeps its own materials: they write the same depth
      // as any stand-in would, just with more shading nobody reads.
      if (source === undefined || Array.isArray(source)) continue

      this.swapped.push({ material: source, mesh })
      mesh.material = mesh.customDepthMaterial ?? this.depthMaterialFor(source)
    }
  }

  private restoreMaterials(): void {
    for (const entry of this.swapped) entry.mesh.material = entry.material
    this.swapped.length = 0
  }

  /**
   * A depth material that keeps whatever of the original decides a silhouette —
   * following three's own rule: only a material that actually cuts itself out
   * carries its textures into the depth pass. Handing a map to a depth material
   * that has no use for it costs bindings the pass never reads.
   */
  private depthMaterialFor(source: Material): MeshDepthMaterial {
    const known = this.depthMaterials.get(source)
    if (known) return known

    const cutout = source as Material & {
      alphaMap?: MeshDepthMaterial['alphaMap']
      alphaTest?: number
      alphaToCoverage?: boolean
      map?: MeshDepthMaterial['map']
    }
    const cuts = cutout.alphaToCoverage === true || ((cutout.alphaTest ?? 0) > 0 && (cutout.alphaMap != null || cutout.map != null))
    const side = SHADOW_SIDE[source.side as keyof typeof SHADOW_SIDE] ?? BackSide

    const depth = cuts ? new MeshDepthMaterial() : (this.plainDepth.get(side) ?? new MeshDepthMaterial())
    depth.name = 'cachedShadowDepth'
    depth.side = side
    if (cuts) {
      depth.alphaMap = cutout.alphaMap ?? null
      depth.alphaTest = cutout.alphaToCoverage === true ? 0.5 : (cutout.alphaTest ?? 0)
      depth.map = cutout.map ?? null
    } else {
      this.plainDepth.set(side, depth)
    }

    this.depthMaterials.set(source, depth)
    return depth
  }

  /**
   * Build the cache and the scratch map: twins of three's own shadow map, down
   * to how they are sampled. The depth attachment has to match bit for bit — a
   * plain `depthBuffer: true` gives a 16-bit renderbuffer where three has a
   * DEPTH_COMPONENT24 texture, and blitting between mismatched depth formats is
   * rejected outright — and a depth texture without a compare mode reaching a
   * sampler2DShadow slot is a GL type mismatch that silently drops draws.
   */
  private ensureTargets(renderer: WebGLRenderer, light: DirectionalLight): boolean {
    const live = light.shadow.map
    if (live === null) return false
    if (this.cache && this.cache.width === live.width && this.cache.height === live.height) return true

    this.dropTargets()
    this.cache = this.twin(renderer, live, 'staticShadowCache')
    this.spare = this.twin(renderer, live, 'composedShadowMap')
    this.blitVerified = false
    this.baked = false
    return true
  }

  private twin(renderer: WebGLRenderer, live: RenderTarget, name: string): WebGLRenderTarget {
    const target = new WebGLRenderTarget(live.width, live.height, { stencilBuffer: false })
    const depth = new DepthTexture(live.width, live.height, UnsignedIntType)
    depth.format = DepthFormat
    depth.compareFunction = live.depthTexture?.compareFunction ?? LessEqualCompare
    depth.minFilter = live.depthTexture?.minFilter ?? NearestFilter
    depth.magFilter = live.depthTexture?.magFilter ?? NearestFilter
    depth.name = name
    target.depthTexture = depth
    target.texture.name = name

    // Force the framebuffer into existence: until something has rendered to it
    // there is nothing for a blit to read from or write to.
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    renderer.clear(true, true, false)
    renderer.setRenderTarget(previous)
    return target
  }

  private dropTargets(): void {
    for (const target of [this.cache, this.spare]) {
      target?.depthTexture?.dispose()
      target?.dispose()
    }
    this.cache = null
    this.spare = null
  }

  /** Copy shadow depth from one map to another — one GPU blit, no geometry. */
  private blit(renderer: WebGLRenderer, source: RenderTarget | null, destination: RenderTarget | null): boolean {
    if (source === null || destination === null) return false

    const ctx = renderer.getContext()
    if (typeof WebGL2RenderingContext === 'undefined' || !(ctx instanceof WebGL2RenderingContext)) return false

    const from = this.framebuffer(renderer, source)
    const to = this.framebuffer(renderer, destination)
    if (!from || !to) return false

    // A depth blit between mismatched attachments fails as a GL error, not an
    // exception — and a shadow map full of nothing renders as a world in total
    // darkness. Check it once, on the first copy, and fall back honestly.
    const verifying = !this.blitVerified
    if (verifying) for (let drained = 0; drained < 8 && ctx.getError() !== ctx.NO_ERROR; drained += 1) { /* drain */ }

    const state = renderer.state
    state.setScissorTest(false)
    state.bindFramebuffer(ctx.READ_FRAMEBUFFER, from)
    state.bindFramebuffer(ctx.DRAW_FRAMEBUFFER, to)
    ctx.blitFramebuffer(
      0, 0, source.width, source.height,
      0, 0, destination.width, destination.height,
      ctx.DEPTH_BUFFER_BIT,
      ctx.NEAREST,
    )
    state.bindFramebuffer(ctx.READ_FRAMEBUFFER, null)
    state.bindFramebuffer(ctx.DRAW_FRAMEBUFFER, null)

    if (verifying) {
      this.blitVerified = true
      if (ctx.getError() !== ctx.NO_ERROR) return false
    }
    return true
  }

  private framebuffer(renderer: WebGLRenderer, target: RenderTarget): WebGLFramebuffer | null {
    const buffer = (renderer.properties.get(target) as RenderTargetProperties).__webglFramebuffer
    if (!buffer || Array.isArray(buffer)) return null
    return buffer
  }
}
