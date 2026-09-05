import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PCFShadowMap, PCFSoftShadowMap } from 'three'

import { CachedShadowRig } from './cachedShadowRig'
import { useCachedShadowsEnabled } from './shadowMode'

/**
 * Owns the scene's shadow map updates. Drop one into any canvas that casts
 * shadows, next to the camera:
 *
 *   <ShadowCompositor every={2} />
 *
 * Two modes, chosen by the persisted player setting (`?shadows=` overrides in DEV):
 *
 *  - `cached`  — the static world is baked once and only the movers are redrawn
 *                each frame (see CachedShadowRig). The default.
 *  - `legacy`  — the whole shadow map is re-rendered every `every` frames. What
 *                the game shipped before caching existed, and the fallback the
 *                rig degrades to on its own when a scene is not a fit.
 *
 * Either way `shadowMap.autoUpdate` is off: three would otherwise redo the full
 * pass every frame, which is the cost both modes exist to avoid.
 */
export function ShadowCompositor({ every = 2 }: { every?: number }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const cached = useCachedShadowsEnabled()
  // A fresh rig per mode: switching modes throws away the baked map with it.
  const rig = useMemo(() => (cached ? new CachedShadowRig() : null), [cached])
  const frame = useRef(0)
  const reported = useRef('')

  // Taking over the shadow map means writing to the renderer: that is the whole
  // job here, and there is no React state anywhere near it.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    // `shadows="soft"` asks for PCFSoftShadowMap, which three deprecated: it
    // downgrades to PCF on the first shadow pass — but every material compiled
    // before that point declares the shadow map as a plain sampler2D, and once
    // the compare-enabled map is bound those draws are rejected outright.
    // Settling the type up front closes that window for good.
    if (gl.shadowMap.type === PCFSoftShadowMap) gl.shadowMap.type = PCFShadowMap
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
      gl.shadowMap.needsUpdate = true
    }
  }, [gl])

  useEffect(() => () => rig?.dispose(), [rig])

  useFrame(() => {
    if (rig === null) {
      // Always refresh the first few frames so the map is correct once the scene
      // has fully mounted, then fall back to the throttled cadence.
      frame.current += 1
      gl.shadowMap.needsUpdate = frame.current < 3 || frame.current % every === 0
      return
    }

    rig.update(gl, scene, every)

    if (import.meta.env.DEV) {
      const stats = rig.stats()
      const line = `${stats.mode}:${stats.reason ?? ''}:${stats.staticCasters}:${stats.dynamicCasters}`
      if (line !== reported.current) {
        reported.current = line
        console.info(
          `[shadows] ${stats.mode}${stats.reason ? ` (${stats.reason})` : ''} — ` +
            `${stats.staticCasters} static casters baked, ${stats.dynamicCasters} redrawn per frame`,
        )
      }
    }
  })
  /* eslint-enable react-hooks/immutability */

  return null
}
