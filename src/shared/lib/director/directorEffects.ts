import { BlendFunction, Effect } from 'postprocessing'
import { Uniform, Vector3 } from 'three'

import type { DirectorSettings } from './directorSettings'
import { stopsToGain } from './lightGeometry'

const LOOK_FRAGMENT = `
uniform float exposureGain;
uniform vec3 balance;
uniform float contrast;
uniform float shadowLiftEV;
uniform float saturation;

const float CURVE_PIVOT = 0.18;
const float SHADOW_FLOOR = 0.02;
const float LUMINANCE_FLOOR = 1e-6;
const vec3 REC709_LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 shapeLookLuminance(vec3 colour) {
  float y = max(dot(colour, REC709_LUMA), LUMINANCE_FLOOR);
  float shadowWeight = 1.0 - smoothstep(SHADOW_FLOOR, CURVE_PIVOT, y);
  float curved = CURVE_PIVOT * pow(y / CURVE_PIVOT, contrast);
  return colour * (curved * exp2(shadowLiftEV * shadowWeight) / y);
}

float saturationHeadroom(float offset, float y) {
  return offset < 0.0 ? y / max(-offset, LUMINANCE_FLOOR) : 1e6;
}

vec3 saturateAtConstantLuminance(vec3 colour) {
  float y = dot(colour, REC709_LUMA);
  vec3 offset = colour - y;
  float limit = min(min(saturationHeadroom(offset.r, y), saturationHeadroom(offset.g, y)), saturationHeadroom(offset.b, y));
  return vec3(y) + offset * min(saturation, limit);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 exposed = inputColor.rgb * exposureGain * balance;
  outputColor = vec4(saturateAtConstantLuminance(shapeLookLuminance(exposed)), inputColor.a);
}
`

const GRAIN_FRAGMENT = `
uniform float strength;
uniform float frame;

const float GRAIN_HIGHLIGHT_FALLOFF = 0.6;
const float DISPLAY_GAMMA = 2.2;

float grainHash(vec2 pixel) {
  return fract(sin(dot(pixel, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 display = pow(max(inputColor.rgb, 0.0), vec3(1.0 / DISPLAY_GAMMA));
  float noise = grainHash(floor(gl_FragCoord.xy) + vec2(fract(frame * 0.6180339) * 997.0, fract(frame * 0.4142135) * 991.0)) - 0.5;
  float shadowWeight = 1.0 - clamp(dot(display, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0) * GRAIN_HIGHLIGHT_FALLOFF;
  vec3 grained = max(display + noise * strength * shadowWeight, 0.0);
  outputColor = vec4(pow(grained, vec3(DISPLAY_GAMMA)), inputColor.a);
}
`

export class DirectorLookEffect extends Effect {
  constructor() {
    super('DirectorLookEffect', LOOK_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['exposureGain', new Uniform(1)],
        ['balance', new Uniform(new Vector3(1, 1, 1))],
        ['contrast', new Uniform(1)],
        ['shadowLiftEV', new Uniform(0)],
        ['saturation', new Uniform(1)],
      ]),
    })
  }

  apply(look: DirectorSettings['look']): void {
    this.uniforms.get('exposureGain')!.value = stopsToGain(look.exposureEV)
    ;(this.uniforms.get('balance')!.value as Vector3).set(
      stopsToGain(look.balanceRedStops),
      stopsToGain(look.balanceGreenStops),
      stopsToGain(look.balanceBlueStops),
    )
    this.uniforms.get('contrast')!.value = look.contrast
    this.uniforms.get('shadowLiftEV')!.value = look.shadowLiftEV
    this.uniforms.get('saturation')!.value = Math.max(0, look.saturation)
  }
}

export class FilmGrainEffect extends Effect {
  constructor() {
    super('FilmGrainEffect', GRAIN_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['strength', new Uniform(0)],
        ['frame', new Uniform(0)],
      ]),
    })
  }

  applyStrength(value: number): void {
    this.uniforms.get('strength')!.value = value
  }

  update(): void {
    const frame = this.uniforms.get('frame')!
    frame.value = (frame.value + 1) % 65536
  }
}
