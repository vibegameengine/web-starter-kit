// The layer stack, as GLSL.
//
// Separated from the material because the two are read for different reasons:
// this file is the technique, and `layeredTerrainMaterial.ts` is the plumbing
// that hands three.js the strings, the uniforms and the textures.

import { HEIGHT_BLEND_SHARPNESS, OVERLAY_FEATHER } from '../systems/terrainLayerStack'

export const MAX_LAYERS = 8

export const LAYER_VARIANT_GLSL = `
// Every lookup below takes EXPLICIT gradients.
//
// A stochastic sampler feeds the hardware a uv that jumps at every cell border
// and wraps with fract(). The implicit derivative there is enormous, the GPU
// reads the smallest mip it has, and a fine surface viewed from a distance turns
// into crawling white sparkle. The gradient of the SMOOTH pre-shuffle uv is the
// footprint that was actually meant, and a quarter turn does not change its size.
vec2 gLayerDx = vec2(0.0);
vec2 gLayerDy = vec2(0.0);

/** One cell's variant of an array slice: quarter turn, offset and tone, as the base does. */
vec3 layerVariantSample(int layer, vec2 cell, vec2 localUv) {
  float h = antiTilingHash12(cell);
  vec2 rotated = antiTilingQuarterTurn(localUv, h);
  vec2 offset = vec2(antiTilingHash12(cell + vec2(17.0, 3.0)), antiTilingHash12(cell + vec2(5.0, 29.0)));
  float tone = mix(0.82, 1.18, antiTilingHash12(cell + vec2(41.0, 11.0)));
  return textureGrad(uLayerAlbedo, vec3(fract(rotated + offset), float(layer)), gLayerDx, gLayerDy).rgb * tone;
}

/** The whole stochastic blend at an arbitrary uv, relief only. Same four cells,
 *  same turns and offsets as the colour — a shadow tap that read the map any
 *  other way would fall next to the stone instead of behind it. */
vec2 layerReliefAt(int layer, vec2 uv);

/** The same cell's RELIEF in .x and its ranked COVERAGE in .y. Sampled through
 *  the identical turn and offset as the colour: a height read from a different
 *  part of the map than the albedo cuts the stone's edge somewhere the stone is
 *  not. Two questions of one map — how high is it here, and is there a stone
 *  here at all — which must never be allowed to drift apart. */
vec2 layerVariantHeight(int layer, vec2 cell, vec2 localUv) {
  float h = antiTilingHash12(cell);
  vec2 rotated = antiTilingQuarterTurn(localUv, h);
  vec2 offset = vec2(antiTilingHash12(cell + vec2(17.0, 3.0)), antiTilingHash12(cell + vec2(5.0, 29.0)));
  return textureGrad(uLayerHeight, vec3(fract(rotated + offset), float(layer)), gLayerDx, gLayerDy).rg;
}

vec2 layerReliefAt(int layer, vec2 uv) {
  vec2 cell = floor(uv);
  vec2 local = fract(uv);
  vec2 t = smoothstep(vec2(0.0), vec2(1.0), local);
  vec2 h00 = layerVariantHeight(layer, cell, local);
  vec2 h10 = layerVariantHeight(layer, cell + vec2(1.0, 0.0), local);
  vec2 h01 = layerVariantHeight(layer, cell + vec2(0.0, 1.0), local);
  vec2 h11 = layerVariantHeight(layer, cell + vec2(1.0, 1.0), local);
  return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
}

/** The same cell's normal. The quarter turn must be applied to the VECTOR as well
 *  as to the lookup: a rotated stone lit from an unrotated normal reads as a
 *  flat print of a stone that happens to catch the light from the wrong side. */
vec3 layerVariantNormal(int layer, vec2 cell, vec2 localUv) {
  float h = antiTilingHash12(cell);
  vec2 rotated = antiTilingQuarterTurn(localUv, h);
  vec2 offset = vec2(antiTilingHash12(cell + vec2(17.0, 3.0)), antiTilingHash12(cell + vec2(5.0, 29.0)));
  vec3 sampled = textureGrad(uLayerNormalMap, vec3(fract(rotated + offset), float(layer)), gLayerDx, gLayerDy).xyz * 2.0 - 1.0;
  if (h < 0.25) return sampled;
  if (h < 0.5) return vec3(-sampled.y, sampled.x, sampled.z);
  if (h < 0.75) return vec3(-sampled.x, -sampled.y, sampled.z);
  return vec3(sampled.y, -sampled.x, sampled.z);
}
`

/** Everything the layer stack declares in the fragment stage, in one place. */
export const LAYER_FRAGMENT_DECLARATIONS = `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uLayerAlbedo;
uniform sampler2DArray uLayerHeight;
uniform sampler2D uLayerMask0;
uniform sampler2D uLayerMask1;
uniform int uLayerCount;
uniform float uLayerTile[${MAX_LAYERS}];
uniform float uLayerBlend[${MAX_LAYERS}];
uniform float uLayerBias[${MAX_LAYERS}];
uniform sampler2DArray uLayerNormalMap;
uniform float uLayerDepth[${MAX_LAYERS}];
uniform float uLayerDensity[${MAX_LAYERS}];
uniform float uLayerContact[${MAX_LAYERS}];
uniform float uLayerNormalStrength[${MAX_LAYERS}];
vec3 gLayerNormal = vec3(0.0);
float gLayerShade = 1.0;
uniform vec2 uLayerAtlasOrigin;
uniform float uLayerAtlasSize;
uniform int uDebugLayer;
// The surface's OWN coordinates. A mask written against a field authored around
// the origin must not read WORLD position: the moment the surface is placed
// anywhere but the origin the field answers zero and the feature vanishes —
// which is exactly how a road can exist on an isolated pedestal and be missing
// from the same pedestal standing in a row.
varying vec2 vLayerLocal;


`

/**
 * The blend itself, as one string.
 *
 * It lives outside `createLayeredTerrainMaterial` because it is the material's
 * whole subject and reads as one piece — and because a factory that also holds
 * two hundred lines of GLSL is a function nobody can see the shape of.
 */
/**
 * Resolving the stack: which layer covers what, and in what proportion.
 *
 * Split from the pass below at the seam the shader itself has — everything
 * here answers "how much of each layer is at this pixel", and nothing here
 * lights anything.
 */
const layerSampleGlsl = ({ hostSurfaceAssignments, glslMaskAssignments }: LayerGlsl) => `

  // Layer i lives at page i>>2, channel i&3 — the rule the baker follows too.
  vec2 layerAtlasUv = (vAntiTilingWorldPosition.xz - uLayerAtlasOrigin) / max(uLayerAtlasSize, 0.001);
  vec4 layerPage0 = texture2D(uLayerMask0, layerAtlasUv);
  vec4 layerPage1 = texture2D(uLayerMask1, layerAtlasUv);
  float layerMask[${MAX_LAYERS}];
  layerMask[0] = layerPage0.r; layerMask[1] = layerPage0.g;
  layerMask[2] = layerPage0.b; layerMask[3] = layerPage0.a;
  layerMask[4] = layerPage1.r; layerMask[5] = layerPage1.g;
  layerMask[6] = layerPage1.b; layerMask[7] = layerPage1.a;
  // A layer that names a GLSL mask overrides its baked channel. This is what
  // lets the world's own quantities — depth below the waterline, road coverage —
  // BE masks, instead of being baked copies of something the shader already knows.
${glslMaskAssignments}

  // Every layer is read through the SAME stochastic treatment the base surface
  // uses, so the stack inherits its break-up instead of tiling visibly.
  float layerWeight[${MAX_LAYERS}];
  vec3 layerColor[${MAX_LAYERS}];
  vec3 layerNormalOf[${MAX_LAYERS}];
  vec2 layerRelief[${MAX_LAYERS}];
  vec2 layerUvOf[${MAX_LAYERS}];
  float layerSharp[${MAX_LAYERS}];
  float layerTotal = 0.0;

  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    layerWeight[i] = 0.0;
    layerColor[i] = vec3(0.0);
    layerNormalOf[i] = vec3(0.0, 0.0, 1.0);
    layerRelief[i] = vec2(0.0);
    layerUvOf[i] = vec2(0.0);
    layerSharp[i] = 1.0;
    if (i >= uLayerCount) continue;

    vec2 layerUv = vAntiTilingWorldPosition.xz / max(uLayerTile[i], 0.001);
    // Parallax: shift this layer's own lookup against the view. A stony surface
    // reads as stone because near sides hide what is behind them as the camera
    // moves — one texture read buys that without a single triangle.
    if (uLayerDepth[i] > 0.0) {
      // World space, not view space: this layer's uv axes ARE world X and Z,
      // because that is how layerUv was built. A view-space offset would swim
      // with the camera instead of standing still on the ground.
      vec3 layerToCamera = normalize(cameraPosition - vAntiTilingWorldPosition);
      float layerProbe = textureGrad(uLayerHeight, vec3(layerUv, float(i)), dFdx(layerUv), dFdy(layerUv)).r;
      float layerSink = (1.0 - layerProbe) * uLayerDepth[i];
      layerUv -= (layerToCamera.xz / max(layerToCamera.y, 0.30)) * (layerSink / max(uLayerTile[i], 0.001));
    }
    gLayerDx = dFdx(layerUv);
    gLayerDy = dFdy(layerUv);
    // How much of this layer's texture one screen pixel spans. Below a certain
    // size the layer's detail cannot be resolved and must stop being decided
    // per pixel.
    layerSharp[i] = clamp(1.0 - max(length(gLayerDx), length(gLayerDy)) * 16.0, 0.0, 1.0);
    vec2 layerCell = floor(layerUv);
    vec2 layerLocal = fract(layerUv);
    // FOUR neighbouring cell variants, blended — exactly what the base material's
    // own stochastic sampler does. Taking a single cell is what leaves the visible
    // rectangular patchwork: the variation is right, the seams between cells are not.
    vec3 layerS00 = layerVariantSample(i, layerCell, layerLocal);
    vec3 layerS10 = layerVariantSample(i, layerCell + vec2(1.0, 0.0), layerLocal);
    vec3 layerS01 = layerVariantSample(i, layerCell + vec2(0.0, 1.0), layerLocal);
    vec3 layerS11 = layerVariantSample(i, layerCell + vec2(1.0, 1.0), layerLocal);
    vec2 layerMixT = smoothstep(vec2(0.0), vec2(1.0), layerLocal);
    layerColor[i] = mix(mix(layerS00, layerS10, layerMixT.x), mix(layerS01, layerS11, layerMixT.x), layerMixT.y);
${hostSurfaceAssignments}
    layerRelief[i] = layerReliefAt(i, layerUv);
    layerUvOf[i] = layerUv;
    // Blended across the same four cells as the colour, and for the same reason.
    // Taking N00 alone — which this did — computed the other three and threw them
    // away, and left the colour smooth across a cell border while the normal
    // jumped: a lighting seam on the layer's own tiling grid.
    if (uLayerNormalStrength[i] > 0.0) {
      vec3 layerN00 = layerVariantNormal(i, layerCell, layerLocal);
      vec3 layerN10 = layerVariantNormal(i, layerCell + vec2(1.0, 0.0), layerLocal);
      vec3 layerN01 = layerVariantNormal(i, layerCell + vec2(0.0, 1.0), layerLocal);
      vec3 layerN11 = layerVariantNormal(i, layerCell + vec2(1.0, 1.0), layerLocal);
      layerNormalOf[i] = mix(mix(layerN00, layerN10, layerMixT.x), mix(layerN01, layerN11, layerMixT.x), layerMixT.y);
    }

    // The base is never masked away: if everything else lets go, ground is still
    // ground. It is also what stops an all-height stack leaving unshaded holes.
    if (i == 0) { layerWeight[i] = 1.0; layerTotal += 1.0; continue; }
    if (uLayerBlend[i] > 1.5) continue; // alpha and overlay are applied after

    float m = layerMask[i];
    if (m <= 0.0) continue;
    float w = m;
    if (uLayerBlend[i] > 0.5) {
      w *= exp(${HEIGHT_BLEND_SHARPNESS}.0 * (layerRelief[i].x - 0.5 + uLayerBias[i]));
    }
    layerWeight[i] = w;
    layerTotal += w;
  }

  if (layerTotal > 0.0) {
    for (int i = 0; i < ${MAX_LAYERS}; i++) layerWeight[i] /= layerTotal;
  }

`

/**
 * Lids and overlays: what a layer COVERS, it covers.
 *
 * Separate from the sampling above because it answers a different question —
 * not "what does this layer look like here" but "how much of the pixel does it
 * take from everything under it".
 */
const layerLidGlsl = () => `
  // A road is not 70% road: what a lid covers, it covers, and what is left below
  // keeps its proportions.
  for (int i = 1; i < ${MAX_LAYERS}; i++) {
    if (i >= uLayerCount || uLayerBlend[i] < 1.5 || uLayerBlend[i] > 2.5) continue;
    float cover = layerMask[i];
    if (cover <= 0.0) continue;
    for (int j = 0; j < ${MAX_LAYERS}; j++) {
      if (j != i) layerWeight[j] *= 1.0 - cover;
    }
    layerWeight[i] = cover;
  }

  // OVERLAY: laid over the finished stack, lids included. Stones are on the
  // road and in the riverbed and on the bare soil alike — a stone does not care
  // what it is lying on. Its own relief decides where it covers, so the gaps
  // between stones show whatever the stack resolved underneath.
  for (int i = 1; i < ${MAX_LAYERS}; i++) {
    if (i >= uLayerCount || uLayerBlend[i] < 2.5) continue;
    // The coverage channel is ranked, so cutting at 1 - density covers exactly
    // that fraction of the ground. Density is the author's number, not a
    // threshold felt out by eye.
    float cut = 1.0 - uLayerDensity[i];
    float hard = clamp((layerRelief[i].y - cut) / ${OVERLAY_FEATHER.toFixed(3)}, 0.0, 1.0);
    // Far away, the mip-averaged coverage IS the fraction of the pixel the
    // stones occupy; a hard cut there makes every pixel guess, and the field
    // crawls. Below the cut it is soil, so the soft answer is scaled to land on
    // the same average the hard one would.
    float soft = clamp((layerRelief[i].y - cut) / max(uLayerDensity[i], 0.001), 0.0, 1.0);
    float cover = clamp(layerMask[i], 0.0, 1.0) * mix(soft, hard, layerSharp[i]);
    if (cover <= 0.0) continue;
    for (int j = 0; j < ${MAX_LAYERS}; j++) {
      if (j != i) layerWeight[j] *= 1.0 - cover;
    }
    layerWeight[i] = cover;
  }

`

const layerResolveGlsl = (parts: LayerGlsl) => layerSampleGlsl(parts) + layerLidGlsl()

/** Contact shadow, tints and the compose: the stack becomes a colour. */
const layerComposeGlsl = ({ glslTints, modifierGlsl }: LayerGlsl) => `
  // CONTACT SHADOW. Parallax digs into a surface; it cannot lift anything above
  // it, so a stone comes out flush with the ground and the scoured gaps around
  // it read as the stone being pressed IN. What says "this is lying on top" is
  // the shadow the stone throws on its own downhill side, so one tap along the
  // light tells each point whether something ahead of it is high enough to be
  // standing between it and the sun.
#if NUM_DIR_LIGHTS > 0
  vec3 layerSunWorld = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
  for (int i = 1; i < ${MAX_LAYERS}; i++) {
    // NOT gated on this layer's weight: the shadow falls on the GROUND BESIDE
    // the stone, which is exactly where the stone's own coverage is zero.
    if (i >= uLayerCount || uLayerContact[i] <= 0.0) continue;
    // How far along the ground the light travels while climbing this layer's
    // own depth. Below the horizon the step is meaningless, hence the floor.
    vec2 layerSunStep = (layerSunWorld.xz / max(layerSunWorld.y, 0.25))
      * (max(uLayerDepth[i], 0.01) * 2.0 / max(uLayerTile[i], 0.001));
    // Everything the layer's relief leaves LOW is a gap between its stones, and
    // a gap is shaded from most of the sky. Without this the soil between the
    // stones is lit as brightly as their tops, which is what makes the field
    // read as a pattern printed on flat ground.
    gLayerShade *= 1.0 - uLayerContact[i] * 0.55 * (1.0 - layerRelief[i].x);
    float layerAhead = layerReliefAt(i, layerUvOf[i] + layerSunStep).x;
    // The blocker has to be a STONE, not a lump of grit: the soil between them
    // has relief of its own, and shadowing off every grain covers the ground in
    // dark stipple.
    float layerBlocked = smoothstep(0.18, 0.55, layerAhead - layerRelief[i].x);
    gLayerShade *= 1.0 - uLayerContact[i] * layerBlocked;
  }
#endif

${glslTints}

  vec3 layered = vec3(0.0);
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= uLayerCount) continue;
    layered += layerWeight[i] * layerColor[i];
    // The layer's own relief, weighted the same way its colour is. A layer that
    // changes albedo but not normal reads as a picture printed on the ground.
    if (uLayerNormalStrength[i] > 0.0) {
      gLayerNormal += layerWeight[i] * uLayerNormalStrength[i] * layerNormalOf[i];
    }
  }

${modifierGlsl}

  if (uDebugLayer >= 0) {
    float shown = 0.0;
    for (int i = 0; i < ${MAX_LAYERS}; i++) if (i == uDebugLayer) shown = i == 0 ? layerWeight[0] : layerMask[i];
    sampledDiffuseColor.rgb = vec3(shown);
  } else {
    // The base surface's macro variation still multiplies the stack, so the
    // large-scale tonal drift of the ground carries across every layer.
    sampledDiffuseColor.rgb = layered * gLayerShade;
  }

  diffuseColor *= sampledDiffuseColor;
`

export const layerBlendGlsl = (parts: LayerGlsl) => layerResolveGlsl(parts) + layerComposeGlsl(parts)

/** The four generated snippets a layer set contributes to the shader. */
export type LayerGlsl = {
  readonly glslMaskAssignments: string
  readonly glslTints: string
  readonly hostSurfaceAssignments: string
  readonly modifierGlsl: string
}
