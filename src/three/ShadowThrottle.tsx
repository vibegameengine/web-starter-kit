import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

/**
 * Rendering the shadow map is a full extra pass over every shadow-casting object
 * in the scene, and by default three.js does it EVERY frame. But shadows change
 * slowly: the sun is fixed, and dynamic units move only a little between frames.
 * A shadow map refreshed every N frames is visually indistinguishable from one
 * refreshed every frame, at 1/N the cost.
 *
 * So we take manual control: `shadowMap.autoUpdate = false`, then flag
 * `needsUpdate` ourselves every `every` frames.
 *
 * - `every={1}` → same as default (update every frame).
 * - `every={2}`/`{3}` → good default for a live scene with moving objects.
 * - `every={Infinity}` (or a huge number) → effectively "bake once": render the
 *   shadow map for the first few frames, then never again — for fully static scenes.
 *
 * When the game grows to hundreds of units, the next step is a static/dynamic
 * split (bake the world's shadows once, give units cheap blob/contact shadows),
 * but throttling is the simple, always-correct first win.
 */
export function ShadowThrottle({ every = 2 }: { every?: number }) {
  const gl = useThree((state) => state.gl)
  const frame = useRef(0)

  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])

  useFrame(() => {
    // Always refresh the first few frames so the map is correct once the scene
    // has fully mounted, then fall back to the throttled cadence.
    if (frame.current < 3 || frame.current % every === 0) {
      gl.shadowMap.needsUpdate = true
    }
    frame.current += 1
  })

  return null
}
