import * as THREE from 'three'

type Spark = readonly [number, number, number, number, number]

const BURST_SPARKS: readonly Spark[] = [
  [0.8, 0.1, 0.0, 0.00, 0.00], [0.68, 0.44, 0.14, 0.02, 0.10], [0.47, 0.72, -0.08, 0.04, 0.20],
  [0.12, 0.9, 0.04, 0.06, 0.35], [-0.28, 0.8, 0.16, 0.08, 0.52], [-0.66, 0.58, -0.1, 0.10, 0.68],
  [-0.9, 0.17, 0.06, 0.12, 0.82], [-0.76, -0.35, -0.15, 0.14, 0.95], [-0.48, -0.67, 0.08, 0.16, 0.05],
  [-0.1, -0.92, -0.04, 0.18, 0.18], [0.34, -0.77, 0.13, 0.20, 0.32], [0.7, -0.47, -0.06, 0.22, 0.47],
  [1.02, 0.42, 0.1, 0.24, 0.62], [0.34, 1.04, -0.12, 0.26, 0.78], [-0.55, 1.0, 0.05, 0.28, 0.92],
  [-1.04, 0.56, -0.03, 0.30, 0.13], [-1.1, -0.3, 0.1, 0.32, 0.27], [-0.54, -1.08, -0.08, 0.34, 0.41],
  [0.38, -1.0, 0.06, 0.36, 0.57], [1.04, -0.38, -0.11, 0.38, 0.72], [0.04, 1.18, 0.0, 0.40, 0.88],
]

const EMBER_SPARKS: readonly Spark[] = [
  [0.55, 0.44, 0.02, 0.08, 0.1], [0.25, 0.76, -0.04, 0.12, 0.3], [-0.24, 0.68, 0.08, 0.16, 0.5],
  [-0.62, 0.38, -0.05, 0.2, 0.7], [-0.7, -0.08, 0.03, 0.24, 0.9], [-0.42, -0.52, 0.06, 0.28, 0.15],
  [0.02, -0.72, -0.07, 0.32, 0.35], [0.48, -0.46, 0.04, 0.36, 0.55], [0.72, -0.02, -0.02, 0.4, 0.75],
  [0.04, 0.98, 0.07, 0.44, 0.95], [-0.84, 0.04, -0.04, 0.48, 0.2], [0.88, 0.36, 0.02, 0.52, 0.45],
]

// A single authored rocket head plus its short, deliberately uneven gold tail.
const LAUNCH_SPARKS: readonly Spark[] = [
  [0.00, 0.00, 0.00, 0.00, 0.08], [0.02, -0.10, 0.00, 0.06, 0.14],
  [-0.02, -0.20, 0.01, 0.12, 0.20], [0.01, -0.32, -0.01, 0.18, 0.12],
  [-0.01, -0.46, 0.00, 0.24, 0.18],
]

function makeGeometry(sparks: readonly Spark[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(sparks.flatMap(([x, y, z]) => [x, y, z]), 3))
  geometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(sparks.map(([, , , delay]) => delay), 1))
  geometry.setAttribute('aHue', new THREE.Float32BufferAttribute(sparks.map(([, , , , hue]) => hue), 1))
  return geometry
}

const vertexShader = `
  attribute float aDelay;
  attribute float aHue;
  uniform float uTime;
  uniform float uScale;
  uniform float uFall;
  varying float vAlpha;
  varying float vHue;
  void main() {
    float cycle = fract(uTime / 3.2);
    // The rocket rises through the opening fifth; then the bloom breaks.
    float sparkTime = max(0.0, cycle - 0.22 - aDelay * 0.08);
    float expand = smoothstep(0.0, 0.16, sparkTime);
    float fade = 1.0 - smoothstep(0.58, 0.92, sparkTime);
    float visible = step(0.22 + aDelay * 0.08, cycle);
    vec3 p = position * (expand * uScale);
    p.y -= sparkTime * sparkTime * uFall;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = (2.8 + 3.6 * (1.0 - sparkTime)) * fade * visible * (48.0 / -mvPosition.z);
    vAlpha = fade * visible;
    vHue = aHue;
  }
`

const fragmentShader = `
  varying float vAlpha;
  varying float vHue;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float glow = 1.0 - smoothstep(0.08, 0.5, d);
    vec3 gold = vec3(1.0, 0.48, 0.08);
    vec3 violet = vec3(0.72, 0.17, 1.0);
    vec3 cyan = vec3(0.08, 0.78, 1.0);
    vec3 color = mix(gold, violet, smoothstep(0.22, 0.62, vHue));
    color = mix(color, cyan, smoothstep(0.72, 1.0, vHue));
    gl_FragColor = vec4(color * glow * 1.35, glow * vAlpha);
  }
`

const launchVertexShader = `
  attribute float aDelay;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    float cycle = fract(uTime / 3.2);
    float rise = smoothstep(0.02, 0.20, cycle);
    float fade = 1.0 - smoothstep(0.20, 0.29, cycle);
    vec3 p = position;
    p.y += mix(-2.45, 0.0, rise);
    p.y -= aDelay * (0.4 + rise * 0.7);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = (4.2 - aDelay * 4.8) * fade * (48.0 / -mvPosition.z);
    vAlpha = step(0.02, cycle) * fade;
  }
`

const launchFragmentShader = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float glow = 1.0 - smoothstep(0.06, 0.5, d);
    vec3 color = mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.84, 0.24), glow);
    gl_FragColor = vec4(color * glow * 1.6, glow * vAlpha);
  }
`

function makeMaterial(scale: number, fall: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fragmentShader,
    transparent: true,
    uniforms: { uFall: { value: fall }, uScale: { value: scale }, uTime: { value: 0 } },
    vertexShader,
  })
}

function makeLaunchMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fragmentShader: launchFragmentShader,
    transparent: true,
    uniforms: { uTime: { value: 0 } },
    vertexShader: launchVertexShader,
  })
}

export const danceFireworksGeometries = {
  burst: makeGeometry(BURST_SPARKS),
  embers: makeGeometry(EMBER_SPARKS),
  launch: makeGeometry(LAUNCH_SPARKS),
} as const

export const danceFireworksMaterials = {
  burst: makeMaterial(1.45, 1.1),
  embers: makeMaterial(1.15, 1.8),
  launch: makeLaunchMaterial(),
} as const
