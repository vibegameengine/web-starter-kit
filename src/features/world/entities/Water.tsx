import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Simple stylised water for the canal: a transparent sea-blue plane with animated
 * ripples, a soft sun glint, a sky-tinted fresnel edge and foam at the rim. The
 * basin shows through by alpha blending — NO reflection here (no planar mirror,
 * no extra render passes). Reflections will be added later via SSR as a single
 * screen-space post pass, not per surface.
 */

const WATER_SHADER = {
  uniforms: {
    time: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uShallow: { value: new THREE.Color('#38c2e2') },
    uDeep: { value: new THREE.Color('#0b6f9c') },
    uSky: { value: new THREE.Color('#cfe6ff') },
    uSunDir: { value: new THREE.Vector3(40, 52, 34).normalize() },
    uSunColor: { value: new THREE.Color('#fff1d6') },
    uFoamColor: { value: new THREE.Color('#eaf4f6') },
    uAlpha: { value: 0.7 },
  },

  vertexShader: /* glsl */ `
    uniform vec2 uCenter;
    uniform float time;

    varying vec2 vUv;
    varying vec3 vWorldPos;

    float waveHeight(vec2 p, float t) {
      float h = 0.0;
      h += sin(dot(p, vec2(1.00, 0.60)) * 2.2 + t * 1.4) * 0.006;
      h += sin(dot(p, vec2(-0.70, 1.00)) * 3.1 + t * 1.9) * 0.004;
      float d = length(p - uCenter);
      h += sin(d * 7.0 - t * 3.0) * 0.0035 * exp(-d * 0.6);
      return h;
    }

    void main() {
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      float h = waveHeight(world.xz, time);
      vec3 displaced = world.xyz + vec3(0.0, h, 0.0);
      vWorldPos = displaced;
      gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform vec2 uCenter;
    uniform float time;
    uniform vec3 uShallow;
    uniform vec3 uDeep;
    uniform vec3 uSky;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uFoamColor;
    uniform float uAlpha;

    varying vec2 vUv;
    varying vec3 vWorldPos;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    float waveHeight(vec2 p, float t) {
      float h = 0.0;
      h += sin(dot(p, vec2(1.00, 0.60)) * 2.2 + t * 1.4) * 0.006;
      h += sin(dot(p, vec2(-0.70, 1.00)) * 3.1 + t * 1.9) * 0.004;
      float d = length(p - uCenter);
      h += sin(d * 7.0 - t * 3.0) * 0.0035 * exp(-d * 0.6);
      return h;
    }

    vec3 waterNormal(vec2 p, float t) {
      float e = 0.08;
      float hL = waveHeight(p - vec2(e, 0.0), t);
      float hR = waveHeight(p + vec2(e, 0.0), t);
      float hD = waveHeight(p - vec2(0.0, e), t);
      float hU = waveHeight(p + vec2(0.0, e), t);
      vec3 n = normalize(vec3((hL - hR) / (2.0 * e), 1.0, (hD - hU) / (2.0 * e)));
      vec2 q = p * 3.0 + vec2(t * 0.5, -t * 0.35);
      float n1 = vnoise(q), n2 = vnoise(q + vec2(0.4, 0.0)), n3 = vnoise(q + vec2(0.0, 0.4));
      n = normalize(n + vec3((n2 - n1), 0.0, (n3 - n1)) * 0.28);
      return n;
    }

    void main() {
      vec3 N = waterNormal(vWorldPos.xz, time);
      vec3 V = normalize(cameraPosition - vWorldPos);

      // Body colour: deep base, lifted toward the shallow tint on ripple crests.
      float crest = clamp(0.5 + N.x * 0.6, 0.0, 1.0);
      vec3 body = mix(uDeep, uShallow, crest * 0.55);

      // Fresnel → sky tint at grazing angles (cheap, NOT a scene reflection).
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
      vec3 col = mix(body, uSky, fres * 0.5);

      // Sun glint.
      vec3 L = normalize(uSunDir);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 200.0);
      col += spec * uSunColor * 1.5;

      // Foam band along the rim (from the plane's uv border) + a little noise.
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float foam = 1.0 - smoothstep(0.0, 0.05, edge);
      foam *= 0.55 + 0.45 * vnoise(vWorldPos.xz * 8.0 - time * 0.3);
      col = mix(col, uFoamColor, clamp(foam, 0.0, 1.0));

      // A touch more opaque at grazing angles and in the foam.
      float alpha = clamp(mix(uAlpha, 1.0, fres * 0.5 + foam), 0.0, 1.0);
      gl_FragColor = vec4(col, alpha);
    }
  `,
}

type WaterProps = {
  /** World-space Y of the water surface. */
  level?: number
  /** Rectangular surface [width, length] in world units. */
  size?: [number, number]
  /** Canal centre in world XZ. */
  position?: [number, number]
}

export function Water({ level = 0.28, size = [2, 10], position = [0, 0] }: WaterProps) {
  const uniforms = useMemo(() => {
    const u = THREE.UniformsUtils.clone(WATER_SHADER.uniforms)
    u.uCenter.value.set(position[0], position[1])
    return u
  }, [position])

  useFrame((_state, delta) => {
    uniforms.time.value += delta
  })

  return (
    <mesh rotation-x={-Math.PI / 2} position={[position[0], level, position[1]]}>
      <planeGeometry args={[size[0], size[1]]} />
      <shaderMaterial
        vertexShader={WATER_SHADER.vertexShader}
        fragmentShader={WATER_SHADER.fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}
