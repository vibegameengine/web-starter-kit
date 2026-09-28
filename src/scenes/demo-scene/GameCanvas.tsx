import { Canvas } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import { ReadySignal, ShaderWarmup } from '@vibegameengine/shader-warmup'
import { useEffect, useState } from 'react'
import type { TanyAnimation } from '../../features/character/entities/Tany/Tany'

import {
  reportInitialRenderReady,
  useBootstrapRenderRequestId,
} from '../../features/bootstrap'
import { ShadowThrottle } from '../../shared/lib/ShadowThrottle'
import { DepthAwareVfxPortal } from '../../shared/lib/DepthAwareVfxPortal'
import { useFrameRateCap, useGraphicsSettings } from '../../shared/lib/graphics'
import { DirectorCamera } from '../../shared/lib/director/DirectorCamera'
import {
  DirectorDisplayContrast,
  DirectorGlare,
  DirectorGrain,
  DirectorLook,
  DirectorToneMapping,
  DirectorVignette,
} from '../../shared/lib/director/DirectorPost'
import { DanceFireworks } from '../../features/world/entities/DanceFireworks'
import { registerWarmupResources } from '../../features/world/materials/materials'
import { Debug } from './Debug'
import { MotionBlur } from './effects/MotionBlur'
import { StarterScene } from './StarterScene'

registerWarmupResources()

type GameCanvasProps = {
  readonly isDancing?: boolean
  readonly onGreeting?: () => void
  readonly onGreetingFinished?: () => void
  readonly onGreetingVoiceFinished?: () => void
  readonly tanyAnimation?: TanyAnimation
}

export function GameCanvas({
  isDancing = false,
  onGreeting,
  onGreetingFinished,
  onGreetingVoiceFinished,
  tanyAnimation,
}: GameCanvasProps) {
  const requestId = useBootstrapRenderRequestId()
  // eslint-disable-next-line no-restricted-syntax -- one transition for the life of the canvas: false until shader warmup finishes, true after. The scene below it has to render at that moment.
  const [warmed, setWarmed] = useState(false)
  const graphics = useGraphicsSettings()
  const frameRateCap = useFrameRateCap()

  useEffect(() => {
    if (warmed && requestId !== 0) {
      reportInitialRenderReady(requestId)
    }
  }, [warmed, requestId])

  return (
    <Canvas
      flat
      shadows="soft"
      maxFps={frameRateCap}
      dpr={graphics.dpr}
      camera={{ fov: 40, near: 0.1, far: 260, position: [6.2, 3, 10.5] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
    >
      <ShaderWarmup />
      <ReadySignal setReady={setWarmed} />
      <DirectorCamera />
      <ShadowThrottle every={graphics.shadowThrottle} />

      <StarterScene
        isDancing={isDancing}
        onGreeting={onGreeting}
        onGreetingFinished={onGreetingFinished}
        onGreetingVoiceFinished={onGreetingVoiceFinished}
        tanyAnimation={tanyAnimation}
      />

      <DepthAwareVfxPortal>
        <DanceFireworks active={isDancing} />
      </DepthAwareVfxPortal>

      <EffectComposer multisampling={0}>
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
        <DirectorGlare />
        <SMAA />
        <DirectorLook />
        <DirectorToneMapping />
        <DirectorDisplayContrast />
        <DirectorVignette />
        <DirectorGrain />
        <MotionBlur intensity={0.4} jitter={0} samples={12} />
      </EffectComposer>

      <Debug />
    </Canvas>
  )
}
