import { EffectComposerContext } from '@react-three/postprocessing'
import { EffectPass } from 'postprocessing'
import { useContext, useEffect } from 'react'

// Vendored, three-0.185-ported realism-effects per-object/camera motion blur.
// Uses the same VelocityDepthNormalPass as TRAA.
// @ts-expect-error vendored JS, no type declarations
import { MotionBlurEffect } from '../../../shared/vendor/realism-effects/motion-blur/MotionBlurEffect.js'
// @ts-expect-error vendored JS, no type declarations
import { VelocityDepthNormalPass } from '../../../shared/vendor/realism-effects/temporal-reproject/pass/VelocityDepthNormalPass.js'

type MotionBlurProps = { intensity?: number; jitter?: number; samples?: number }

/**
 * Velocity-based motion blur, added imperatively to the composer as the FINAL
 * on-screen pass (it blurs the already-composited frame along per-pixel motion).
 * A VelocityDepthNormalPass feeds it. Render as the last child of <EffectComposer>.
 */
export function MotionBlur({ intensity = 1, jitter = 1, samples = 16 }: MotionBlurProps) {
  const { composer, scene, camera } = useContext(EffectComposerContext)

  useEffect(() => {
    if (!composer || !scene || !camera) {
      return
    }

    const velocityPass = new VelocityDepthNormalPass(scene, camera)
    const motionBlurEffect = new MotionBlurEffect(velocityPass, { intensity, jitter, samples })
    const motionBlurPass = new EffectPass(camera, motionBlurEffect)

    composer.addPass(velocityPass)
    composer.addPass(motionBlurPass)

    // Motion blur is the final pass drawn to the screen.
    composer.passes.forEach((pass) => {
      pass.renderToScreen = false
    })
    motionBlurPass.renderToScreen = true

    return () => {
      composer.removePass(velocityPass)
      composer.removePass(motionBlurPass)
      velocityPass.dispose?.()
      motionBlurEffect.dispose?.()
      motionBlurPass.dispose?.()
      const last = composer.passes[composer.passes.length - 1]
      if (last) {
        last.renderToScreen = true
      }
    }
  }, [composer, scene, camera, intensity, jitter, samples])

  return null
}
