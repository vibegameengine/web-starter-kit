import { useFrame, useThree } from '@react-three/fiber'
import { wrapEffect } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Matrix4, Uniform, Vector3 } from 'three'

import { SSGI_FRAGMENT } from './ssgiShader'

const SAMPLES = 16

// Deterministic cosine-ish hemisphere kernel (golden-angle spiral).
function hemisphereSamples(count: number): Vector3[] {
  const out: Vector3[] = []
  for (let i = 0; i < count; i += 1) {
    const r = Math.sqrt((i + 0.5) / count)
    const theta = i * 2.399963229728653
    out.push(new Vector3(r * Math.cos(theta), r * Math.sin(theta), Math.sqrt(Math.max(0, 1 - r * r))))
  }
  return out
}

type SsgiOptions = { radius?: number; intensity?: number; distanceFalloff?: number }

/**
 * A separate, standalone screen-space GI pass (NOT bolted onto the AO shader):
 * it samples the hemisphere like an AO pass but gathers the lit scene color at
 * occluded samples and adds it back as one-bounce indirect light (color bleed).
 */
class SsgiEffectImpl extends Effect {
  constructor({ radius = 4, intensity = 1, distanceFalloff = 1 }: SsgiOptions = {}) {
    super('SsgiEffect', SSGI_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      // eslint-disable-next-line no-bitwise
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      defines: new Map([['SAMPLES', String(SAMPLES)]]),
      uniforms: new Map<string, Uniform<unknown>>([
        ['uProjMat', new Uniform(new Matrix4())],
        ['uProjInv', new Uniform(new Matrix4())],
        ['uSamples', new Uniform(hemisphereSamples(SAMPLES))],
        ['uRadius', new Uniform(radius)],
        ['uIntensity', new Uniform(intensity)],
        ['uDistanceFalloff', new Uniform(distanceFalloff)],
        ['uFrame', new Uniform(0)],
      ]),
    })
  }

  update() {
    const frame = this.uniforms.get('uFrame')
    if (frame) {
      frame.value = ((frame.value as number) + 1) % 1024
    }
  }
}

const WrappedSsgi = wrapEffect(SsgiEffectImpl)

/**
 * Renders the SSGI effect and feeds it the camera's projection matrices each
 * frame (needed to project hemisphere samples to screen). Place inside
 * <EffectComposer>.
 */
export const Ssgi = forwardRef<SsgiEffectImpl, SsgiOptions>(function Ssgi(props, ref) {
  const effectRef = useRef<SsgiEffectImpl>(null)
  useImperativeHandle(ref, () => effectRef.current as SsgiEffectImpl)
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    const effect = effectRef.current
    if (!effect) {
      return
    }
    ;(effect.uniforms.get('uProjMat')!.value as Matrix4).copy(camera.projectionMatrix)
    ;(effect.uniforms.get('uProjInv')!.value as Matrix4).copy(camera.projectionMatrixInverse)
  })

  return <WrappedSsgi ref={effectRef} {...props} />
})
