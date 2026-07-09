import { StatsGl } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

import { StarterScene } from './scene/StarterScene'

/**
 * WebGL render layer. Lean, atmospheric post — NOT the old heavy chain. The
 * expensive part before was N8AO (SSAO); it's gone. What's left is cheap and
 * gives the mood back: soft Bloom on highlights, AgX filmic tone mapping, a
 * subtle vignette, SMAA for clean edges. Grounding comes from real shadows +
 * ContactShadows in the scene, not a costly AO pass.
 */
export function GameCanvas() {
  return (
    <Canvas
      flat
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 40, near: 0.1, far: 260, position: [7, 4.5, 18] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
    >
      <StarterScene />

      <EffectComposer multisampling={0}>
        {/* Ambient occlusion — dark crevices give the scene depth. halfRes makes
            it ~4× cheaper; depthAwareUpsampling (on by default) keeps the upscale
            clean, and fewer samples cut cost further. */}
        <N8AO
          halfRes
          aoSamples={8}
          denoiseSamples={4}
          denoiseRadius={12}
          aoRadius={2}
          distanceFalloff={1}
          intensity={2.6}
          color="#080b12"
        />
        {/* Soft glow on the brightest areas — atmosphere. */}
        <Bloom mipmapBlur intensity={0.5} luminanceThreshold={0.8} luminanceSmoothing={0.3} />
        <SMAA />
        {/* ACES, not AgX: real tonal range — brights read bright, darks dark,
            instead of everything collapsing to mid-grey. */}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <BrightnessContrast brightness={0} contrast={0.14} />
        <Vignette offset={0.25} darkness={0.4} eskil={false} />
      </EffectComposer>

      {/* Perf panel (FPS / CPU + graphs). */}
      <StatsGl trackGPU={false} />
    </Canvas>
  )
}
