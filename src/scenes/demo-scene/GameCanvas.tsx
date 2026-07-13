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
import { ReadySignal, ShaderWarmup } from '@vibegameengine/shader-warmup'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useState } from 'react'

import {
  reportInitialRenderReady,
  useBootstrapRenderRequestId,
} from '../../features/bootstrap'
import { ShadowThrottle } from '../../shared/lib/ShadowThrottle'
import { DepthAwareVfxPortal } from '../../shared/lib/DepthAwareVfxPortal'
import { DanceFireworks } from '../../features/world/entities/DanceFireworks'
import { registerWarmupResources } from '../../features/world/materials/materials'
import { Debug } from './Debug'
import { MotionBlur } from './effects/MotionBlur'
import { StarterScene } from './StarterScene'

// Register the scene's geometry/material pairs before the Canvas mounts so
// ShaderWarmup can pre-compile their GPU programs on the first pass.
registerWarmupResources()

/**
 * WebGL render layer. Lean, atmospheric post: cheap halfRes N8AO, soft Bloom,
 * ACES tone mapping + contrast, SMAA. Shadows come from the scene's directional
 * key. ShaderWarmup pre-compiles the shaders and only then dismisses the
 * bootstrap overlay — so the first visible frame has no compile stutter.
 */
export function GameCanvas({ isDancing = false }: { readonly isDancing?: boolean }) {
  const requestId = useBootstrapRenderRequestId()
  const [warmed, setWarmed] = useState(false)

  useEffect(() => {
    if (warmed && requestId !== 0) {
      reportInitialRenderReady(requestId)
    }
  }, [warmed, requestId])

  return (
    <Canvas
      flat
      shadows="soft"
      // dpr 1: every full-screen post pass (N8AO, Bloom, SMAA, tone map…) scales
      // with resolution, so >1 on a retina display multiplies their cost. This
      // is the single biggest fps lever here — the N8AO demo runs at dpr 1 too.
      dpr={1}
      camera={{ fov: 40, near: 0.1, far: 260, position: [6.2, 3, 10.5] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
    >
      <ShaderWarmup />
      <ReadySignal setReady={setWarmed} />

      {/* Refresh the shadow map every 2nd frame instead of every frame — the sun
          is fixed and objects move little between frames, so it's imperceptible
          but halves the shadow pass cost. */}
      <ShadowThrottle every={2} />

      <StarterScene isDancing={isDancing} />

      <DepthAwareVfxPortal>
        <DanceFireworks active={isDancing} />
      </DepthAwareVfxPortal>

      <EffectComposer multisampling={0}>
        {/* halfRes → ~4× cheaper AO; depthAwareUpsampling (default) keeps it clean. */}
        <N8AO
          halfRes
          aoSamples={16}
          aoRadius={5}
          denoiseSamples={8}
          denoiseRadius={12}
          distanceFalloff={1}
          intensity={2.6}
          color="#080b12"
        />
        {/* Soft glow on the brightest areas — atmosphere. Fewer mip levels =
            fewer passes (the mip chain was the biggest draw-call cost). */}
        <Bloom mipmapBlur levels={5} intensity={0.5} luminanceThreshold={0.8} luminanceSmoothing={0.3} />
        <SMAA />
        {/* ACES, not AgX: real tonal range — brights read bright, darks dark,
            instead of everything collapsing to mid-grey. */}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <BrightnessContrast brightness={0} contrast={0.14} />
        <Vignette offset={0.25} darkness={0.4} eskil={false} />
        <MotionBlur intensity={0.4} jitter={0} samples={12} />
      </EffectComposer>

      {/* Rich perf panel (FPS / CPU / GPU / draw calls / triangles + graphs).
          Toggle with the "P" key. */}
      <Debug />
    </Canvas>
  )
}
