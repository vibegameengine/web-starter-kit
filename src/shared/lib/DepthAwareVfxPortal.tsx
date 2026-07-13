/* eslint-disable react-hooks/immutability -- Three's renderer is intentionally imperative inside the render pass. */
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useMemo, type ReactNode } from 'react'
import { Scene } from 'three'

/**
 * Renders its children in a separate VFX scene after the main post stack.
 * The world is written first to the default framebuffer, leaving its depth
 * buffer intact for the VFX scene to depth-test against props and terrain.
 */
export function DepthAwareVfxPortal({ children }: { readonly children: ReactNode }) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const worldScene = useThree((state) => state.scene)
  const vfxScene = useMemo(() => new Scene(), [])
  useFrame(() => {
    const previousAutoClear = gl.autoClear
    const previousShadowUpdate = gl.shadowMap.autoUpdate

    // This pass owns the final draw at priority 2: first draw world colour +
    // depth, then draw only the transparent VFX scene into that same depth.
    gl.autoClear = true
    gl.shadowMap.autoUpdate = false
    gl.render(worldScene, camera)
    gl.autoClear = false
    gl.render(vfxScene, camera)

    gl.shadowMap.autoUpdate = previousShadowUpdate
    gl.autoClear = previousAutoClear
  }, 2)

  return createPortal(children, vfxScene)
}
