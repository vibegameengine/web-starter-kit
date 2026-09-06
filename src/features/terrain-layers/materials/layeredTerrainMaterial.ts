import * as THREE from 'three'

import { createAntiTilingGroundDemoMaterial } from '../../anti-tiling-ground/materials/antiTilingGroundResources'
import type { MaskAtlas } from '../systems/layerMask'
import { DEFAULT_OVERLAY_DENSITY, type TerrainLayer } from '../systems/terrainLayerStack'
import { LAYER_FRAGMENT_DECLARATIONS, LAYER_VARIANT_GLSL, MAX_LAYERS, layerBlendGlsl } from './layeredTerrainShader'

/**
 * The layered terrain material.
 *
 * Built ON the project's anti-tiling ground material rather than beside it. That
 * material already solves the problem a layered terrain hits first — a texture
 * tiled across a landscape reads as wallpaper — with per-cell rotation, offset
 * and tone applied stochastically in world space. Every layer here goes through
 * the SAME treatment, so the stack inherits it instead of reintroducing the
 * repetition the `ground` pedestal exists to prevent.
 *
 * The blend itself is one loop over uniform arrays, so a layer is data: its
 * tiling, its blend mode and its height bias are values, and adding one touches
 * nothing that draws it. The arithmetic is the unit-tested
 * `systems/terrainLayerStack.ts`; the GPU only runs it per pixel.
 *
 * Injection point matters: the layer code goes in at the base material's own
 * `diffuseColor *= sampledDiffuseColor;` replacement, NOT as a helper after
 * `#include <common>` — the base only declares `map`, `vAntiTilingWorldPosition`
 * and its tiling uniforms later, and a helper above them cannot see them.
 */


const BLEND_CODE: Record<TerrainLayer['blend'], number> = { weight: 0, height: 1, alpha: 2, overlay: 3 }

export type LayeredTerrainOptions = Readonly<{
  readonly layers: readonly TerrainLayer[]
  /** GLSL the vertex stage needs before any layer's press can be evaluated. */
  readonly vertexPressDeclarations?: string
  /** GLSL the fragment stage needs before any layer's mask can be evaluated. */
  readonly fragmentDeclarations?: string
  /**
   * GLSL applied to `layered` AFTER the stack resolves. For surfaces that have no
   * albedo of their own and are only "the same ground, but wetter" — making one
   * of those a layer means inventing a texture for it and then fighting to keep
   * it identical to its neighbour.
   */
  readonly modifierGlsl?: string
  /** Albedo slices, one per layer, all the same size. */
  readonly albedo: THREE.DataArrayTexture
  /** Relief per layer, for the height blend AND the parallax offset. */
  readonly height: THREE.DataArrayTexture
  /** Tangent-space normal per layer. */
  readonly normal: THREE.DataArrayTexture
  readonly atlas: MaskAtlas
}>

export type LayeredTerrainMaterial = THREE.MeshStandardMaterial & {
  /** Show one layer's mask in greyscale; -1 restores the blended surface. */
  setLayerDebug: (index: number) => void
  /**
   * Move one overlay layer's coverage without rebuilding the material.
   *
   * Density is the only layer field a bench actually turns, and rebuilding the
   * stack to change it means decoding every slice again and throwing away a
   * compiled program to get the same one back — so the knob answers a frame
   * late and each turn leaks the textures the old material owned. It is one
   * number in a uniform array; it belongs behind a setter.
   */
  setOverlayDensity: (index: number, density: number) => void
}

function maskPage(page: Uint8Array, resolution: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(page, resolution, resolution, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}


/**
 * The layer table, as the flat arrays the shader's uniform arrays want.
 *
 * `densities` is handed back rather than copied: `setOverlayDensity` writes
 * into it live, and a uniform array is read by reference every frame.
 */
function packLayerUniforms(layers: readonly TerrainLayer[]) {
  const tiles = new Float32Array(MAX_LAYERS)
  const blends = new Float32Array(MAX_LAYERS)
  const biases = new Float32Array(MAX_LAYERS)
  const depths = new Float32Array(MAX_LAYERS)
  const densities = new Float32Array(MAX_LAYERS)
  const contacts = new Float32Array(MAX_LAYERS)
  const normalStrengths = new Float32Array(MAX_LAYERS)
  layers.forEach((layer, index) => {
    tiles[index] = layer.tileMeters
    blends[index] = BLEND_CODE[layer.blend]
    biases[index] = layer.heightBias ?? 0
    depths[index] = layer.parallaxMeters ?? 0
    densities[index] = layer.density ?? DEFAULT_OVERLAY_DENSITY
    contacts[index] = layer.contactShadow ?? 0
    normalStrengths[index] = layer.normalStrength ?? 0
  })
  return { biases, blends, contacts, densities, depths, normalStrengths, tiles }
}

/** The GLSL a layer set contributes: masks, host surface, tints and the press. */
function generateLayerGlsl(layers: readonly TerrainLayer[]) {
  // Layers that answer with an expression rather than a baked channel.
  const glslMaskAssignments = layers
    .map((layer, index) => (layer.maskGlsl ? `  layerMask[${index}] = clamp(${layer.maskGlsl}, 0.0, 1.0);` : null))
    .filter((line): line is string => line !== null)
    .join('\n')

  // A layer that IS the host surface takes the material's own sampled ground.
  const hostSurfaceAssignments = layers
    .map((layer, index) => (layer.isHostSurface ? `    if (i == ${index}) layerColor[i] = sampledDiffuseColor.rgb;` : null))
    .filter((line): line is string => line !== null)
    .join('\n')

  const glslTints = layers
    .map((layer, index) => (layer.tintGlsl ? `  layerColor[${index}] *= ${layer.tintGlsl};` : null))
    .filter((line): line is string => line !== null)
    .join('\n')

  // Layers that push the ground down. Summed, because two features pressing the
  // same ground both pressed it — a road crossing a rut is deeper, not one or
  // the other.
  const pressExpressions = layers.map((layer) => layer.pressGlsl).filter((press): press is string => Boolean(press))
  // ADDED, not subtracted: a press expression returns the ground's HEIGHT once
  // that layer has had its way with it. Subtracting only the cut leaves a
  // vertical-walled trench in a dead-flat plate, which lights as a black slot.
  const pressGlsl = pressExpressions.length === 0
    ? ''
    : `  transformed.z += ${pressExpressions.map((press) => `(${press})`).join(' + ')};`
  return { glslMaskAssignments, glslTints, hostSurfaceAssignments, pressGlsl }
}

/**
 * The handles a caller gets, and the list of everything to dispose.
 *
 * The host surface's own maps are in that list too: the base material loads
 * them per instance and `material.dispose()` frees the program, never the
 * textures — a bench that rebuilds the stack would otherwise climb the texture
 * count on every rebuild and never come back down.
 */
function attachLayerControls(
  material: LayeredTerrainMaterial,
  owned: {
    readonly albedo: THREE.DataArrayTexture
    readonly densities: Float32Array
    readonly height: THREE.DataArrayTexture
    readonly layers: readonly TerrainLayer[]
    readonly normal: THREE.DataArrayTexture
    readonly pages: readonly THREE.Texture[]
    readonly uDebugLayer: { value: number }
  },
) {
  const { albedo, densities, height, layers, normal, pages, uDebugLayer } = owned
  material.setLayerDebug = (index: number) => {
    uDebugLayer.value = index
  }
  material.setOverlayDensity = (index: number, density: number) => {
    densities[index] = density
  }
  material.customProgramCacheKey = () => `layered-terrain:${layers.map((l) => `${l.id}:${l.blend}`).join(',')}`
  // Everything this material had to CREATE, so a caller can put all of it back.
  // The host surface's own maps are in here too: `createAntiTilingGroundDemoMaterial`
  // loads them per instance, and `material.dispose()` frees the program, never
  // the textures — a bench that rebuilds the stack would otherwise climb the
  // texture count on every rebuild and never come back down.
  const hostExtras = (material.userData.antiTilingGroundExtraTextures as THREE.Texture[] | undefined) ?? []
  material.userData.layeredTerrainTextures = [
    ...pages,
    albedo,
    height,
    normal,
    ...(material.map ? [material.map] : []),
    ...hostExtras,
  ]
}

export function createLayeredTerrainMaterial(options: LayeredTerrainOptions): LayeredTerrainMaterial {
  const { layers, albedo, height, normal, atlas, modifierGlsl = '', vertexPressDeclarations = '', fragmentDeclarations = '' } = options
  if (layers.length > MAX_LAYERS) {
    throw new Error(`terrain layers: ${layers.length} exceeds the ${MAX_LAYERS} the shader declares`)
  }

  const pages = atlas.pages.map((page) => maskPage(page, atlas.resolution))
  while (pages.length < 2) pages.push(maskPage(new Uint8Array(4), 1))

  const { biases, blends, contacts, densities, depths, normalStrengths, tiles } = packLayerUniforms(layers)
  const { glslMaskAssignments, glslTints, hostSurfaceAssignments, pressGlsl } = generateLayerGlsl(layers)

  const material = createAntiTilingGroundDemoMaterial() as LayeredTerrainMaterial
  const baseCompile = material.onBeforeCompile
  const uDebugLayer = { value: -1 }

  material.onBeforeCompile = (shader, renderer) => {
    baseCompile(shader, renderer)
    Object.assign(shader.uniforms, {
      uLayerAlbedo: { value: albedo },
      uLayerHeight: { value: height },
      uLayerMask0: { value: pages[0] },
      uLayerMask1: { value: pages[1] },
      uLayerCount: { value: layers.length },
      uLayerTile: { value: tiles },
      uLayerBlend: { value: blends },
      uLayerBias: { value: biases },
      uLayerNormalMap: { value: normal },
      uLayerDepth: { value: depths },
      uLayerDensity: { value: densities },
      uLayerContact: { value: contacts },
      uLayerNormalStrength: { value: normalStrengths },
      uLayerAtlasOrigin: { value: new THREE.Vector2(atlas.originX, atlas.originZ) },
      uLayerAtlasSize: { value: atlas.sizeMeters },
      uDebugLayer,
    })

    // Declared AFTER the base material's own helpers, not at `#include <common>`:
    // this calls antiTilingHash12/QuarterTurn, and the base inserts those at the
    // same anchor — landing above them makes the shader fail to compile, which
    // renders as a pedestal with nothing on it at all.
    if (pressGlsl !== '') {
      // The plate is authored flat and rotated by the mesh, so its local z is the
      // surface's height. Pressed BEFORE the base writes its world position, so
      // every mask downstream measures the ground the layers actually left.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
varying vec2 vLayerLocal;
${vertexPressDeclarations}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec2 layerPressPoint = transformed.xy;
  vLayerLocal = layerPressPoint;
${pressGlsl}`)
    }

    shader.fragmentShader = shader.fragmentShader
      .replace('vec4 antiTilingMapSample() {', `${fragmentDeclarations}
${LAYER_VARIANT_GLSL}
vec4 antiTilingMapSample() {`)
      .replace('#include <common>', LAYER_FRAGMENT_DECLARATIONS)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  // Tilt the surface normal by whatever relief the stack resolved. The layer uv
  // axes are world X and Z, so the tangent frame is known without a tangent
  // attribute: u -> +X, v -> +Z, up -> +Y. Rotated into view space because that
  // is the space three.js lights in.
  if (abs(gLayerNormal.x) + abs(gLayerNormal.y) > 0.001) {
    vec3 layerTiltView = (viewMatrix * vec4(gLayerNormal.x, 0.0, gLayerNormal.y, 0.0)).xyz;
    normal = normalize(normal + layerTiltView);
  }`,
      )
      .replace(
        'diffuseColor *= sampledDiffuseColor;',
        layerBlendGlsl({ glslMaskAssignments, glslTints, hostSurfaceAssignments, modifierGlsl }),
      )
  }

  attachLayerControls(material, { albedo, densities, height, layers, normal, pages, uDebugLayer })
  return material
}
