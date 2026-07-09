import { StatsGl } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { WebGPURenderer } from 'three/webgpu'

import { StarterScene } from './scene/StarterScene'
import { ReadyGate } from './webgpu/ReadyGate'
import { SSGIPipeline } from './webgpu/SSGIPipeline'

/**
 * The WebGL^H^H^HWebGPU layer. The Canvas is driven by a WebGPURenderer (async
 * factory — r3f awaits `renderer.init()` before the first frame), which is what
 * the official three.js SSGI needs. The scene renders through SSGIPipeline
 * (screen-space global illumination + TRAA), and ReadyGate warms the pipelines
 * and dismisses the bootstrap preloader once the first frames are painted.
 */
export function GameCanvas() {
  return (
    <Canvas
      shadows
      // Pixel ratio 1: SSGI is per-pixel, so >1 (retina) multiplies its cost.
      // The official SSGI example disables pixel ratio for the same reason.
      dpr={1}
      camera={{ fov: 40, near: 0.1, far: 260, position: [7, 4.5, 18] }}
      gl={async (props) => {
        const renderer = new WebGPURenderer({
          canvas: props.canvas as HTMLCanvasElement,
          // No MSAA — TRAA in the pipeline does the anti-aliasing, and MSAA
          // render targets are expensive on WebGPU.
          antialias: false,
          powerPreference: 'high-performance',
        })
        await renderer.init()
        return renderer
      }}
    >
      <StarterScene />
      <SSGIPipeline />
      <ReadyGate />
      {/* Perf panel (FPS / CPU + graphs). trackGPU is off because its WebGL
          timer query doesn't exist on WebGPU and makes the panel fail to show. */}
      <StatsGl trackGPU={false} />
    </Canvas>
  )
}
