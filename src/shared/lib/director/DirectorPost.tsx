import { Bloom, BrightnessContrast, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect, type BrightnessContrastEffect, type ToneMappingEffect, type VignetteEffect } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'

import { DirectorLookEffect, FilmGrainEffect } from './directorEffects'
import { directorSettings, useDirectorSection, type OutputTransform } from './directorSettings'

const TONE_MAPPING_MODES: Record<OutputTransform, ToneMappingMode> = {
  aces: ToneMappingMode.ACES_FILMIC,
  agx: ToneMappingMode.AGX,
  linear: ToneMappingMode.LINEAR,
  neutral: ToneMappingMode.NEUTRAL,
}

export function DirectorLook() {
  const look = useDirectorSection('look')
  const effect = useMemo(() => new DirectorLookEffect(), [])

  useEffect(() => effect.apply(look), [effect, look])
  useEffect(() => () => effect.dispose(), [effect])

  return <primitive object={effect} dispose={null} />
}

export function DirectorGrain() {
  const { grain } = useDirectorSection('look')
  const effect = useMemo(() => new FilmGrainEffect(), [])

  useEffect(() => effect.applyStrength(grain), [effect, grain])
  useEffect(() => () => effect.dispose(), [effect])

  return <primitive object={effect} dispose={null} />
}

export function DirectorToneMapping() {
  const { output } = useDirectorSection('look')
  const initialMode = useMemo(() => TONE_MAPPING_MODES[directorSettings().look.output], [])
  const effect = useRef<ToneMappingEffect>(null)

  useEffect(() => {
    if (effect.current) effect.current.mode = TONE_MAPPING_MODES[output]
  }, [output])

  return <ToneMapping ref={effect} mode={initialMode} />
}

export function DirectorGlare() {
  const { glareIntensity, glareThreshold } = useDirectorSection('post')
  const initial = useMemo(() => directorSettings().post, [])
  const effect = useRef<BloomEffect>(null)

  useEffect(() => {
    if (!effect.current) return
    effect.current.intensity = glareIntensity
    effect.current.luminanceMaterial.threshold = glareThreshold
  }, [glareIntensity, glareThreshold])

  return (
    <Bloom
      ref={effect}
      intensity={initial.glareIntensity}
      levels={5}
      luminanceSmoothing={0.3}
      luminanceThreshold={initial.glareThreshold}
      mipmapBlur
    />
  )
}

export function DirectorDisplayContrast() {
  const { displayContrast } = useDirectorSection('post')
  const initial = useMemo(() => directorSettings().post.displayContrast, [])
  const effect = useRef<BrightnessContrastEffect>(null)

  useEffect(() => {
    if (effect.current) effect.current.contrast = displayContrast
  }, [displayContrast])

  return <BrightnessContrast ref={effect} brightness={0} contrast={initial} />
}

export function DirectorVignette({ offset = 0.25 }: { readonly offset?: number }) {
  const { vignetteDarkness } = useDirectorSection('post')
  const initial = useMemo(() => directorSettings().post.vignetteDarkness, [])
  const effect = useRef<VignetteEffect>(null)

  useEffect(() => {
    if (effect.current) effect.current.darkness = vignetteDarkness
  }, [vignetteDarkness])

  return <Vignette ref={effect} darkness={initial} eskil={false} offset={offset} />
}
