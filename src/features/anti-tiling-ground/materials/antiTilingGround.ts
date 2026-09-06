import * as THREE from 'three'

type AntiTilingGroundOptions = {
  readonly dryMap?: THREE.Texture
  readonly dryLayerStrength?: number
  readonly distortionStrength?: number
  readonly macroScale?: number
  readonly macroStrength?: number
  readonly secondLayerScale?: number
  readonly secondLayerStrength?: number
  readonly variationStrength?: number
  readonly worldOffset?: THREE.Vector2
  readonly worldTileSize?: THREE.Vector2
}

const VERTEX_DECLARATION = 'varying vec3 vAntiTilingWorldPosition;'

const FRAGMENT_DECLARATION = `
varying vec3 vAntiTilingWorldPosition;
uniform float uAntiTilingVariationStrength;
uniform float uAntiTilingMacroStrength;
uniform float uAntiTilingMacroScale;
uniform float uAntiTilingSecondLayerStrength;
uniform float uAntiTilingSecondLayerScale;
uniform float uAntiTilingDistortionStrength;
uniform vec2 uAntiTilingWorldTileSize;
uniform vec2 uAntiTilingWorldOffset;
uniform sampler2D uAntiTilingDryMap;
uniform float uAntiTilingDryLayerStrength;

float antiTilingHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float antiTilingNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(antiTilingHash12(i), antiTilingHash12(i + vec2(1.0, 0.0)), f.x),
    mix(antiTilingHash12(i + vec2(0.0, 1.0)), antiTilingHash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

vec2 antiTilingQuarterTurn(vec2 uv, float pick) {
  if (pick < 0.25) return uv;
  if (pick < 0.5) return vec2(uv.y, 1.0 - uv.x);
  if (pick < 0.75) return vec2(1.0 - uv.x, 1.0 - uv.y);
  return vec2(1.0 - uv.y, uv.x);
}

vec3 antiTilingVariant(sampler2D sourceTexture, vec2 cell, vec2 localUv) {
  float hash = antiTilingHash12(cell);
  vec2 rotated = antiTilingQuarterTurn(localUv, hash);
  vec2 offset = vec2(antiTilingHash12(cell + vec2(17.0, 3.0)), antiTilingHash12(cell + vec2(5.0, 29.0)));
  vec3 sampled = texture2D(sourceTexture, fract(rotated + offset)).rgb;
  float tone = mix(0.82, 1.18, antiTilingHash12(cell + vec2(41.0, 11.0)));
  return sampled * tone;
}

vec3 antiTilingStochasticSample(sampler2D sourceTexture, vec2 uv) {
  vec2 cell = floor(uv);
  vec2 localUv = fract(uv);
  vec2 blend = localUv * localUv * (3.0 - 2.0 * localUv);
  vec3 s00 = antiTilingVariant(sourceTexture, cell, localUv);
  vec3 s10 = antiTilingVariant(sourceTexture, cell + vec2(1.0, 0.0), localUv);
  vec3 s01 = antiTilingVariant(sourceTexture, cell + vec2(0.0, 1.0), localUv);
  vec3 s11 = antiTilingVariant(sourceTexture, cell + vec2(1.0, 1.0), localUv);
  return mix(mix(s00, s10, blend.x), mix(s01, s11, blend.x), blend.y);
}

vec2 antiTilingRotate27(vec2 uv) {
  mat2 rotation = mat2(vec2(0.8910, -0.4540), vec2(0.4540, 0.8910));
  return rotation * uv;
}

vec4 antiTilingMapSample() {
  vec2 safeTileSize = max(uAntiTilingWorldTileSize, vec2(0.001));
  vec2 uv = vAntiTilingWorldPosition.xz / safeTileSize + uAntiTilingWorldOffset;
  float warpX = antiTilingNoise(uv * 0.37 + vec2(13.2, 2.7)) - 0.5;
  float warpY = antiTilingNoise(uv * 0.41 + vec2(5.1, 19.4)) - 0.5;
  vec2 warpedUv = uv + vec2(warpX, warpY) * uAntiTilingDistortionStrength;
  vec3 stochastic = antiTilingStochasticSample(map, warpedUv);
  vec3 regular = texture2D(map, warpedUv).rgb;
  vec3 secondLayer = antiTilingStochasticSample(map, antiTilingRotate27(warpedUv * uAntiTilingSecondLayerScale) + vec2(11.7, 4.3));
  float macro = antiTilingNoise(uv * uAntiTilingMacroScale);
  float dryMacro = antiTilingNoise(uv * 0.31 + vec2(23.4, 6.8));
  float dryDetail = antiTilingNoise(uv * 0.79 + vec2(7.3, 31.9));
  vec3 color = mix(regular, stochastic, uAntiTilingVariationStrength);
  color = mix(color, secondLayer, uAntiTilingSecondLayerStrength);
  vec3 dryLayer = texture2D(uAntiTilingDryMap, antiTilingRotate27(warpedUv * 0.83) + vec2(37.1, 13.6)).rgb;
  float dryMask = smoothstep(0.18, 0.66, dryMacro * 0.72 + dryDetail * 0.28);
  float dryBlend = dryMask * uAntiTilingDryLayerStrength;
  color = mix(color, dryLayer, dryBlend);
  color *= mix(vec3(0.80, 0.84, 0.87), vec3(0.93, 0.90, 0.84), dryBlend);
  color *= mix(1.0 - uAntiTilingMacroStrength, 1.0 + uAntiTilingMacroStrength, macro);
  return vec4(color, dryBlend);
}
`

const ANTI_TILING_MAP_FRAGMENT = `
#ifdef USE_MAP

  vec4 sampledDiffuseColor = antiTilingMapSample();
  diffuseColor *= sampledDiffuseColor;
  float antiTilingDryCoverage = sampledDiffuseColor.a;

#endif
`

const ANTI_TILING_ROUGHNESS_FRAGMENT = `
  #include <roughnessmap_fragment>
  roughnessFactor *= mix(0.78, 1.08, antiTilingDryCoverage);
`

/**
 * Port of a world-space stochastic anti-tiling material. It keeps the standard
 * MeshStandardMaterial lighting, shadows, fog and post-processing path; only
 * the base-color lookup is replaced with varied, blended texture samples.
 */
export function createAntiTilingGroundMaterial(
  map: THREE.Texture,
  {
    dryMap,
    dryLayerStrength = 0,
    distortionStrength = 0.06,
    macroScale = 0.18,
    macroStrength = 0.18,
    secondLayerScale = 1.73,
    secondLayerStrength = 0.28,
    variationStrength = 0.65,
    worldOffset = new THREE.Vector2(0, 0),
    worldTileSize = new THREE.Vector2(5.5, 5.5),
  }: AntiTilingGroundOptions = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', map, metalness: 0, roughness: 0.86 })
  const resolvedDryMap = dryMap ?? map

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uAntiTilingDistortionStrength: { value: distortionStrength },
      uAntiTilingDryLayerStrength: { value: dryLayerStrength },
      uAntiTilingDryMap: { value: resolvedDryMap },
      uAntiTilingMacroScale: { value: macroScale },
      uAntiTilingMacroStrength: { value: macroStrength },
      uAntiTilingSecondLayerScale: { value: secondLayerScale },
      uAntiTilingSecondLayerStrength: { value: secondLayerStrength },
      uAntiTilingVariationStrength: { value: variationStrength },
      uAntiTilingWorldOffset: { value: worldOffset },
      uAntiTilingWorldTileSize: { value: worldTileSize },
    })

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATION}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vAntiTilingWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${FRAGMENT_DECLARATION}`)
      .replace('#include <map_fragment>', ANTI_TILING_MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', ANTI_TILING_ROUGHNESS_FRAGMENT)
  }
  material.userData.antiTilingGroundExtraTextures = dryMap ? [dryMap] : []
  material.customProgramCacheKey = () => 'zone-stalker-anti-tiling-ground-v2-layered'

  return material
}
