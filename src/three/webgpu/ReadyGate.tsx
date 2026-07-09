import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'

import {
  reportInitialRenderReady,
  useBootstrapRenderRequestId,
} from '../../bootstrap'

/**
 * WebGPU readiness gate. Precompiles the scene's render pipelines with the
 * renderer's native `compileAsync` (the WebGPU analogue of shader-warmup — no
 * first-frame compile stutter), then dismisses the bootstrap overlay once a
 * couple of real frames have been drawn.
 */
export function ReadyGate() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const requestId = useBootstrapRenderRequestId()

  const [warmed, setWarmed] = useState(false)
  const reported = useRef(false)

  useEffect(() => {
    let cancelled = false
    const warm = async () => {
      try {
        await gl.compileAsync?.(scene, camera)
      } catch {
        // Warmup is best-effort; never block reveal on it.
      }
      if (!cancelled) {
        setWarmed(true)
      }
    }
    void warm()
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera])

  useFrame(() => {
    if (warmed && !reported.current) {
      reported.current = true
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (requestId !== 0) {
            reportInitialRenderReady(requestId)
          }
          // The perf panel (and any DOM overlay) is mounted while the app is
          // still hidden under the bootstrap overlay (opacity:0 + transform +
          // blur), so it computes its position blind and stays invisible. Once
          // the overlay has faded, nudge a reflow so it repositions and shows.
          window.setTimeout(() => window.dispatchEvent(new Event('resize')), 600)
        }),
      )
    }
  })

  return null
}
