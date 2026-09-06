// A terrain surface as a STACK OF LAYERS, in the shape a landscape material has
// in an engine that does this for a living — rather than as one shader with each
// new surface hand-mixed into it in a fixed order.
//
// This file is the arithmetic and nothing else: no textures, no GL, no React. It
// is exactly what the shader does, written so it can be tested without a
// renderer, because a blend rule that can only be checked by looking at a frame
// is a blend rule nobody can change safely.
//
// The model, reduced to what earns its place:
//   · a LAYER carries a full PBR bundle, not a colour, so a wet road comes out
//     dark AND rough AND flat-normalled at once rather than in three patches.
//   · a MASK says how much of it is here — a field, like the ones the world
//     already uses for growth and roads.
//   · a BLEND MODE says how that mask is honoured. Weight is a plain average;
//     HEIGHT lets the layer's own relief take the edge, so gravel comes up
//     through turf instead of cross-fading into it; alpha lays a lid over
//     everything beneath; OVERLAY lies on top of the finished stack, so stones
//     are on the road and in the riverbed and on the bare soil alike.

export type TerrainBlendMode = 'alpha' | 'height' | 'overlay' | 'weight'

export type TerrainLayer = Readonly<{
  readonly id: string
  /** World metres one repeat of this layer's maps covers. */
  readonly tileMeters: number
  readonly blend: TerrainBlendMode
  /**
   * Pushes this layer's relief up or down against its neighbours' before the
   * height blend compares them. Positive = this layer wins its edges.
   */
  readonly heightBias?: number
  /**
   * The layer's mask as a GLSL EXPRESSION, evaluated in the fragment stage.
   *
   * Masks in a live world are not painted textures — they are the quantities the
   * ground already knows: how far below the waterline this fragment is, how much
   * road covers it, how wet the bank is. Those exist as functions in the terrain
   * material, so a layer must be able to name one instead of asking for a bake
   * of something the shader could have answered for free.
   *
   * Omit it and the layer reads its baked channel from the mask atlas. Both
   * kinds live in one stack, which is what lets a hand-authored pedestal and a
   * streamed world share the same architecture.
   */
  readonly maskGlsl?: string
  /** Multiplied into the layer's colour. Used where a surface is a shade of another. */
  readonly tintGlsl?: string
  /** Roughness this layer imposes where it wins, as a GLSL expression. */
  readonly roughnessGlsl?: string
  /**
   * How far this layer PRESSES the ground down, in metres, as a GLSL expression
   * evaluated in the VERTEX stage against the surface's local XY.
   *
   * A road is not paint. It is a thing vehicles pushed into the soil, and the
   * ground under it sits lower than the ground beside it — which is why the
   * world carves it into the terrain rather than tinting it. A layer that can
   * only change colour can never reproduce that, so deformation belongs in the
   * layer definition next to the mask that places it.
   */
  readonly pressGlsl?: string
  /**
   * This layer IS the host surface — the material's own sampled ground — rather
   * than a slice of the layer array.
   *
   * The base of a real terrain is not one more texture to paint on top: it is
   * whatever the ground already is. Giving the stack its own copy of it means
   * two definitions of the same surface that must be kept equal by hand, and
   * they never stay equal.
   */
  readonly isHostSurface?: boolean
  /**
   * For an OVERLAY: the fraction of the ground its stones actually cover, 0..1.
   *
   * The coverage channel of a layer's height map is RANKED — a pixel's value is
   * the fraction of the map lying below it — so cutting at 1 - density claims
   * exactly that share of the surface. Density is therefore a number the author
   * states, not a threshold somebody feels out by eye and re-feels every time
   * the map is redrawn.
   */
  readonly density?: number
  /**
   * Metres of apparent DEPTH this layer's height map is allowed to fake, by
   * shifting its own lookup against the view direction.
   *
   * A stony surface is not a picture of stones: the eye reads it as stone
   * because the near side of each one hides what is behind it as you move. A
   * layer with a real height map can produce that without a single triangle,
   * which is what lets rock overlay a whole terrain instead of being modelled.
   * 0 disables it.
   */
  readonly parallaxMeters?: number
  /**
   * How hard this layer casts its own shadow onto what lies under it, 0..1.
   *
   * Parallax can only dig INTO a surface, never raise anything above it, so on
   * its own it makes a stone read as flush with the ground with holes scoured
   * around it — pressed in rather than lying on top. What tells the eye an
   * object is standing proud is the shadow it throws on its own downhill side.
   * One tap along the light direction buys that, and it is the difference
   * between stones on the ground and stones in the ground.
   */
  readonly contactShadow?: number
  /**
   * Strength of this layer's own normal map, 0..1. Blended by the same weights
   * as its colour, so wherever the layer takes over, its relief takes over too —
   * a layer that changes albedo but not normal reads as a decal, not a surface.
   */
  readonly normalStrength?: number
}>

/** How sharply a height blend resolves. At 0 it degenerates into a weight blend. */
export const HEIGHT_BLEND_SHARPNESS = 12

/**
 * How wide the band is, in coverage units, between an overlay showing nothing
 * and showing fully. Narrow, because a stone has an EDGE: the ground either has
 * a stone at this point or it does not, and a long ramp turns the field into a
 * stain.
 */
export const OVERLAY_FEATHER = 0.05

/** What an overlay covers when it does not say. */
export const DEFAULT_OVERLAY_DENSITY = 0.3

export type LayerSample = Readonly<{
  /** Mask value at this point, 0..1. */
  readonly weight: number
  /** This layer's own relief at this point, 0..1. Ignored unless it height-blends. */
  readonly height: number
}>

/**
 * Resolve the stack at one point into contributions that sum to 1.
 *
 * Two rules carry the whole thing:
 *
 * 1. The BASE layer is never masked away. Everything else competes for coverage
 *    on top of it, so if they all let go the ground is still ground. This is also
 *    the guard against the classic all-height-blend failure, where layers whose
 *    weights race each other to zero leave unshaded holes where they meet.
 *
 * 2. An ALPHA layer is not a competitor, it is a lid: what it covers it covers
 *    completely, and whatever is left underneath keeps its relative proportions.
 *    A road is not 70% road and 30% turf; it is a road.
 *
 * 3. An OVERLAY is not in the competition at all. It is laid over the finished
 *    result, INCLUDING over lids — stones lie on the road, in the riverbed and
 *    on bare soil, because a stone does not care what it is lying on. Its own
 *    relief decides where it covers: high points are stone, the gaps between
 *    them show whatever the stack resolved underneath.
 */
export function resolveLayerWeights(
  layers: readonly TerrainLayer[],
  samples: readonly LayerSample[],
): number[] {
  const count = layers.length
  if (count === 0) return []

  const raw = new Array<number>(count).fill(0)
  raw[0] = 1

  for (let index = 1; index < count; index += 1) {
    const layer = layers[index]
    if (layer.blend === 'alpha' || layer.blend === 'overlay') continue

    const weight = clamp01(samples[index].weight)
    if (weight <= 0) continue

    raw[index] = layer.blend === 'height'
      // Multiplying rather than replacing keeps the mask in charge of WHERE and
      // lets relief decide the edge inside that where.
      ? weight * Math.exp(HEIGHT_BLEND_SHARPNESS * (clamp01(samples[index].height) - 0.5 + (layer.heightBias ?? 0)))
      : weight
  }

  let total = 0
  for (const value of raw) total += value
  const resolved = raw.map((value) => (total > 0 ? value / total : 0))

  for (let index = 1; index < count; index += 1) {
    if (layers[index].blend !== 'alpha') continue
    const cover = clamp01(samples[index].weight)
    if (cover <= 0) continue
    for (let under = 0; under < count; under += 1) {
      if (under !== index) resolved[under] *= 1 - cover
    }
    resolved[index] = cover
  }

  for (let index = 1; index < count; index += 1) {
    const layer = layers[index]
    if (layer.blend !== 'overlay') continue
    const cover = overlayCoverage(layer, samples[index])
    if (cover <= 0) continue
    for (let under = 0; under < count; under += 1) {
      if (under !== index) resolved[under] *= 1 - cover
    }
    resolved[index] = cover
  }

  return resolved
}

/**
 * How much of this point an overlay actually covers: its mask says where it is
 * allowed to be, its own relief says where within that it rises clear of the
 * ground.
 */
export function overlayCoverage(layer: TerrainLayer, sample: LayerSample, sharpness = 1): number {
  const cut = 1 - clamp01(layer.density ?? DEFAULT_OVERLAY_DENSITY)
  const hard = clamp01((clamp01(sample.height) - cut) / OVERLAY_FEATHER)

  // As the surface recedes, one screen pixel spans many stones, and a hard cut
  // makes each pixel guess ON or OFF — which is what turns a stony field into
  // crawling white sparkle at distance. The mip-averaged relief IS the fraction
  // of that pixel's footprint the stones occupy, which is exactly the answer an
  // antialiased cut would converge to, so far away the coverage becomes it.
  const soft = clamp01(sample.height)
  return clamp01(sample.weight) * (soft + (hard - soft) * clamp01(sharpness))
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}
