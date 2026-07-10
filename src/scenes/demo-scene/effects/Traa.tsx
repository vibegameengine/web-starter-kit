import { EffectComposerContext } from '@react-three/postprocessing'
import { EffectPass, type Pass } from 'postprocessing'
import { useContext, useEffect } from 'react'

// Vendored, three-0.185-ported realism-effects TRAA (temporal reprojection
// anti-aliasing) — a real WebGL TAA. See src/vendor/realism-effects.
// @ts-expect-error vendored JS, no type declarations
import { TRAAEffect } from '../../../shared/vendor/realism-effects/traa/TRAAEffect.js'
// @ts-expect-error vendored JS, no type declarations
import { VelocityDepthNormalPass } from '../../../shared/vendor/realism-effects/temporal-reproject/pass/VelocityDepthNormalPass.js'

/**
 * WebGL temporal anti-aliasing (realism-effects TRAA), added imperatively to the
 * @react-three/postprocessing composer: a VelocityDepthNormalPass feeds a TRAA
 * EffectPass. Keep it before screen-space color grading / bloom passes: temporal
 * reprojection works on scene color, not final post-processed screen color.
 */
export function Traa() {
  const { composer, scene, camera } = useContext(EffectComposerContext)

  useEffect(() => {
    if (!composer || !scene || !camera) {
      return
    }

    const velocityPass = new VelocityDepthNormalPass(scene, camera)
    // neighborhoodClamp clamps the temporal history to the current frame's
    // neighborhood — kills the garbage/smear on glossy, view-dependent surfaces
    // (the blue cube / green cone artifacts) that can't be reprojected.
    const traaEffect = new TRAAEffect(scene, camera, velocityPass, {
      maxBlend: 0.96,
      neighborhoodClamp: true,
      neighborhoodClampRadius: 2,
      neighborhoodClampIntensity: 0.35,
      confidencePower: 2,
    })
    const traaPass = new EffectPass(camera, traaEffect)
    const insertIndex = findFirstScreenSpaceColorPassIndex(composer.passes)

    if (insertIndex === undefined) {
      composer.addPass(velocityPass)
      composer.addPass(traaPass)
    } else {
      composer.addPass(velocityPass, insertIndex)
      composer.addPass(traaPass, insertIndex + 1)
    }

    return () => {
      composer.removePass(velocityPass)
      composer.removePass(traaPass)
      velocityPass.dispose?.()
      traaEffect.dispose?.()
      traaPass.dispose?.()
    }
  }, [composer, scene, camera])

  return null
}

function findFirstScreenSpaceColorPassIndex(passes: readonly Pass[]): number | undefined {
  const index = passes.findIndex((pass) => {
    const effects = (pass as { effects?: { name?: string }[] }).effects
    return effects?.some((effect) =>
      ['BloomEffect', 'SMAAEffect', 'ToneMappingEffect', 'BrightnessContrastEffect', 'VignetteEffect'].includes(
        effect.name ?? '',
      ),
    )
  })

  return index === -1 ? undefined : index
}
