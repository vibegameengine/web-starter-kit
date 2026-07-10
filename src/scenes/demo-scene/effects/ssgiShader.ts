/**
 * Screen-space GI fragment shader — the "SSAO that also gathers color" idea:
 * the same hemisphere sampling an AO pass does, but at each occluded sample we
 * also read the lit scene color and accumulate it as one-bounce indirect light
 * (color bleed). Based on the sampling in n8ao's EffectShader.
 *
 * Runs as a postprocessing Effect with EffectAttribute.CONVOLUTION | DEPTH, so
 * `inputBuffer` (lit color) and `depthBuffer` are available to sample freely.
 */
export const SSGI_FRAGMENT = /* glsl */ `
uniform mat4 uProjMat;
uniform mat4 uProjInv;
uniform vec3 uSamples[SAMPLES];
uniform float uRadius;
uniform float uIntensity;
uniform float uDistanceFalloff;
uniform float uFrame;

// View-space position from screen uv + non-linear depth.
vec3 getViewPos(vec2 uvv, float d) {
  vec4 clip = vec4(uvv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 view = uProjInv * clip;
  return view.xyz / view.w;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float depth = texture2D(depthBuffer, uv).x;
  if (depth >= 1.0) { outputColor = inputColor; return; }

  vec3 pos = getViewPos(uv, depth);
  vec3 n = normalize(cross(dFdx(pos), dFdy(pos)));

  // Per-pixel rotated tangent frame to break up banding.
  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tang = normalize(cross(up, n));
  vec3 bitang = cross(n, tang);
  // Static per-pixel rotation (no uFrame) — animating it makes the noise
  // "rain". Static grain instead; a denoise pass can clean it later.
  float ang = hash12(uv * resolution) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  mat3 tbn = mat3(tang, bitang, n) * mat3(ca, -sa, 0.0, sa, ca, 0.0, 0.0, 0.0, 1.0);

  // Same hemisphere sampling as SSAO — but at each occluded sample we also read
  // the occluding surface's color. The occlusion is then tinted with that color
  // instead of plain grey: crevices near the red sphere darken red, etc.
  float occSum = 0.0;   // how occluded (SSAO amount)
  vec3 colSum = vec3(0.0); // occluder color, weighted the same way
  float w = 0.0;

  for (int i = 0; i < SAMPLES; i++) {
    vec3 dir = tbn * uSamples[i];
    vec3 sp = pos + dir * uRadius;
    vec4 off = uProjMat * vec4(sp, 1.0);
    vec2 suv = (off.xy / off.w) * 0.5 + 0.5;
    if (suv.x <= 0.0 || suv.x >= 1.0 || suv.y <= 0.0 || suv.y >= 1.0) continue;

    float sd = texture2D(depthBuffer, suv).x;
    vec3 spos = getViewPos(suv, sd);

    // Occluded if a real surface at suv is nearer than the sample point
    // (view-space z<0 → nearer = larger z).
    float range = smoothstep(0.0, 1.0, uDistanceFalloff / max(abs(spos.z - sp.z), 1e-3));
    float cosw = max(dot(n, normalize(spos - pos)), 0.0);
    float hit = range * cosw * step(sp.z + 0.025, spos.z);

    occSum += hit;
    colSum += hit * texture2D(inputBuffer, suv).rgb;
    w += 1.0;
  }

  // SSAO factor (1 = open, 0 = fully occluded) and the average occluder colour.
  float ao = clamp(1.0 - (occSum / max(w, 1.0)) * uIntensity, 0.0, 1.0);
  vec3 occColor = occSum > 1e-3 ? colSum / occSum : vec3(1.0);

  // Colour the darkening: as occlusion deepens (ao→0) the shadow takes on the
  // occluder's hue instead of going grey.
  vec3 tint = mix(occColor, vec3(1.0), ao);
  outputColor = vec4(inputColor.rgb * tint, inputColor.a);
}
`
