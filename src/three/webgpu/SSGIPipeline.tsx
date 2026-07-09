import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { UnsignedByteType } from 'three'
import { RenderPipeline } from 'three/webgpu'
import {
  add,
  diffuseColor,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  sample,
  unpackRGBToNormal,
  vec4,
  velocity,
} from 'three/tsl'
import { ssgi } from 'three/addons/tsl/display/SSGINode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js'

/**
 * Official three.js screen-space global illumination — the WebGPU/TSL SSGI node.
 * Wired exactly like the three.js `webgpu_postprocessing_ssgi` example:
 *
 *   scenePass (MRT: output + diffuseColor + normal + velocity)
 *     → ssgi(color, depth, normal, camera) → AO + GI
 *     → composite (color * AO + diffuse * GI)
 *     → traa (temporal anti-aliasing / accumulation)
 *
 * It builds a RenderPipeline and drives it in the render loop (useFrame priority
 * 1 takes over rendering from r3f).
 */
export function SSGIPipeline() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  const pipeline = useMemo(() => {
    const scenePass = pass(scene, camera)
    scenePass.setMRT(
      mrt({
        output,
        diffuseColor,
        normal: packNormalToRGB(normalView),
        velocity,
      }),
    )

    const scenePassColor = scenePass.getTextureNode('output')
    const scenePassDiffuse = scenePass.getTextureNode('diffuseColor')
    const scenePassDepth = scenePass.getTextureNode('depth')
    const scenePassNormal = scenePass.getTextureNode('normal')
    const scenePassVelocity = scenePass.getTextureNode('velocity')

    // Bandwidth optimization (from the example): 8-bit is enough for these.
    scenePass.getTexture('diffuseColor').type = UnsignedByteType
    scenePass.getTexture('normal').type = UnsignedByteType

    const sceneNormal = sample((uv: unknown) => unpackRGBToNormal(scenePassNormal.sample(uv)))

    const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera)
    // Perf is dominated by sliceCount × stepCount (rays/pixel). Keep it low and
    // let temporal accumulation + the denoiser clean it up — 2×8 is the tuned
    // default; 3×16 was 3× the cost for little visible gain with temporal on.
    giPass.sliceCount.value = 2
    giPass.stepCount.value = 8
    // Built-in temporal accumulation ON — the main tool that makes real-time
    // SSGI clean (like Minecraft shader packs): it reprojects the GI history
    // across frames so it converges instead of sparkling.
    giPass.useTemporalFiltering = true

    // Adaptively amortize the expensive GI ray-march. When the camera moves
    // fast, recompute every frame (screen-space GI must match the current view,
    // or it smears — the "nasty artifacts"). When still or slow (autorotate),
    // recompute only every Nth frame and reuse the cached result that lives in
    // the node's own render target — a big perf win with no visible cost.
    const GI_UPDATE_INTERVAL = 3
    // Per-frame camera-speed thresholds above which we treat it as "fast motion"
    // and force a full-rate recompute. Tuned so slow autorotate stays amortized.
    const ANGLE_SPEED = 0.006 // radians/frame
    const POS_SPEED_SQ = 0.01 // (world units/frame)^2
    const lastPos = camera.position.clone()
    const lastQuat = camera.quaternion.clone()
    const originalUpdateBefore = giPass.updateBefore.bind(giPass)
    let giFrame = 0
    giPass.updateBefore = (frame: unknown) => {
      const movingFast =
        camera.position.distanceToSquared(lastPos) > POS_SPEED_SQ ||
        camera.quaternion.angleTo(lastQuat) > ANGLE_SPEED
      lastPos.copy(camera.position)
      lastQuat.copy(camera.quaternion)

      if (movingFast || giFrame % GI_UPDATE_INTERVAL === 0) {
        originalUpdateBefore(frame)
      }
      giFrame += 1
    }

    // Multi-pass edge-aware à-trous denoise, guided by depth+normal. Chaining
    // passes with a rotated kernel each time (via `index`) removes far more
    // noise than a single pass — this knocks down the residual sparkle during
    // camera motion, where temporal accumulation can't converge.
    const denoiseTwice = (source: unknown) => {
      const pass1 = denoise(source, scenePassDepth, sceneNormal, camera)
      pass1.index.value = 0
      const pass2 = denoise(pass1, scenePassDepth, sceneNormal, camera)
      pass2.index.value = 1
      return pass2
    }
    const ao = denoiseTwice(giPass.getAONode())
    const gi = denoiseTwice(giPass.getGINode())

    const compositePass = vec4(
      add(scenePassColor.rgb.mul(ao.r), scenePassDiffuse.rgb.mul(gi.rgb)),
      scenePassColor.a,
    )

    // TRAA now only does anti-aliasing (+ mild temporal stability) on the
    // already-denoised composite.
    const traaPass = traa(compositePass, scenePassDepth, scenePassVelocity, camera)

    const renderPipeline = new RenderPipeline(gl)
    renderPipeline.outputNode = traaPass
    return renderPipeline
  }, [gl, scene, camera])

  useEffect(() => () => pipeline.dispose(), [pipeline])

  // Take over rendering (priority > 0 disables r3f's automatic render).
  useFrame(() => {
    pipeline.render()
  }, 1)

  return null
}
