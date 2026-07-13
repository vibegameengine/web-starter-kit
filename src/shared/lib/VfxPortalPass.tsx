import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  Pass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'
import * as THREE from 'three'

import { VFX_PIPELINE_CONFIG } from '../config/vfxPipeline'

type VfxPipeline = {
  composer: EffectComposer
  compositeCamera: THREE.OrthographicCamera
  compositeGeometry: THREE.PlaneGeometry
  compositeMaterial: THREE.MeshBasicMaterial
  compositeScene: THREE.Scene
}

function renderPortalPipeline(gl: THREE.WebGLRenderer, pipeline: VfxPipeline, delta: number) {
  const previousTarget = gl.getRenderTarget()
  const previousAutoClear = gl.autoClear
  pipeline.composer.render(delta)
  gl.setRenderTarget(null)
  gl.autoClear = false
  gl.render(pipeline.compositeScene, pipeline.compositeCamera)
  gl.autoClear = previousAutoClear
  gl.setRenderTarget(previousTarget)
}

class DepthAwareVfxScenePass extends Pass {
  private readonly worldScene: THREE.Scene
  private readonly vfxScene: THREE.Scene
  private readonly renderCamera: THREE.Camera
  private readonly depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
    side: THREE.DoubleSide,
  })

  constructor(
    worldScene: THREE.Scene,
    vfxScene: THREE.Scene,
    renderCamera: THREE.Camera,
  ) {
    super('DepthAwareVfxScenePass')
    this.worldScene = worldScene
    this.vfxScene = vfxScene
    this.renderCamera = renderCamera
    this.depthMaterial.colorWrite = false
    this.needsSwap = true
  }

  override render(renderer: THREE.WebGLRenderer, _inputBuffer: THREE.WebGLRenderTarget | null, outputBuffer: THREE.WebGLRenderTarget | null) {
    const previousTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear
    const previousClearColor = renderer.getClearColor(new THREE.Color())
    const previousClearAlpha = renderer.getClearAlpha()
    const previousBackground = this.worldScene.background
    const previousOverrideMaterial = this.worldScene.overrideMaterial
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate

    renderer.autoClear = false
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, true, false)

    // Populate only depth from the world. VFX color stays transparent black,
    // while ordinary depthTest keeps particles behind walls and props hidden.
    this.worldScene.background = null
    this.worldScene.overrideMaterial = this.depthMaterial
    renderer.render(this.worldScene, this.renderCamera)

    this.worldScene.overrideMaterial = previousOverrideMaterial
    this.worldScene.background = previousBackground
    renderer.render(this.vfxScene, this.renderCamera)

    renderer.setRenderTarget(previousTarget)
    renderer.setClearColor(previousClearColor, previousClearAlpha)
    renderer.shadowMap.autoUpdate = previousShadowAutoUpdate
    renderer.autoClear = previousAutoClear
  }

  override dispose() {
    this.depthMaterial.dispose()
    super.dispose()
  }
}

export function VfxPortalPass({ vfxScene }: { vfxScene: THREE.Scene }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const worldScene = useThree((state) => state.scene)

  const pipeline = useMemo(() => {
    const composer = new EffectComposer(gl, {
      depthBuffer: true,
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    })
    composer.autoRenderToScreen = false

    const scenePass = new DepthAwareVfxScenePass(worldScene, vfxScene, camera)
    const bloom = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      intensity: VFX_PIPELINE_CONFIG.bloomIntensity,
      levels: VFX_PIPELINE_CONFIG.bloomLevels,
      luminanceThreshold: VFX_PIPELINE_CONFIG.luminanceThreshold,
      luminanceSmoothing: VFX_PIPELINE_CONFIG.luminanceSmoothing,
      mipmapBlur: true,
    })
    // Source emission stays untouched. Khronos Neutral compresses HDR peaks
    // without the saturated-blue hue shift produced by ACES.
    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })
    const effectsPass = new EffectPass(camera, bloom, toneMapping)
    effectsPass.renderToScreen = false
    composer.addPass(scenePass)
    composer.addPass(effectsPass)

    const compositeScene = new THREE.Scene()
    const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const compositeGeometry = new THREE.PlaneGeometry(2, 2)
    const compositeMaterial = new THREE.MeshBasicMaterial({
      map: composer.inputBuffer.texture,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      transparent: true,
      toneMapped: false,
    })
    const compositeMesh = new THREE.Mesh(compositeGeometry, compositeMaterial)
    compositeMesh.frustumCulled = false
    compositeScene.add(compositeMesh)

    return { composer, compositeCamera, compositeGeometry, compositeMaterial, compositeScene }
  }, [camera, gl, vfxScene, worldScene])

  useEffect(() => {
    pipeline.composer.setSize(size.width, size.height)
  }, [pipeline, size.height, size.width])

  useEffect(() => () => {
    pipeline.compositeScene.clear()
    pipeline.compositeGeometry.dispose()
    pipeline.compositeMaterial.dispose()
    pipeline.composer.dispose()
  }, [pipeline])

  useFrame((_, delta) => {
    renderPortalPipeline(gl, pipeline, delta)
  }, 2)

  return null
}
