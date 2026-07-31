import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { DirectionalLight, Object3D } from 'three'
import { Vector3 } from 'three'

import { useCachedShadowsEnabled } from './shadows'

/**
 * The sun, plus the one thing a fixed `<directionalLight castShadow>` gets wrong.
 *
 * A directional light's shadow map is an ORTHOGRAPHIC box. Written declaratively
 * (`shadow-camera-left={-20}` …) that box sits around the world origin and never
 * moves, so shadows exist only on that patch of the world: walk out of it and
 * every shadow — including the player's own — simply vanishes.
 *
 * The fix every engine uses: keep the box small (it is the shadow resolution
 * budget) and slide it with whatever the player is looking at. `follow` is that
 * anchor, normally the player root. `offset` is the sun's position RELATIVE to
 * the anchor, so the light direction stays constant while the box travels.
 *
 * The centre is snapped to whole shadow texels. Without snapping the depth
 * samples slide under static geometry as the anchor moves and every shadow edge
 * crawls. Snapping happens in world XZ rather than in light space — an
 * approximation that leaves a little shear, invisible under the soft PCF filter.
 *
 * Without `follow` this is an ordinary fixed sun over the origin.
 */
type SunShadowProps = {
  readonly bias?: number
  readonly color: string
  /** Anchor the shadow box travels with — the player root in a gameplay scene. */
  readonly follow?: RefObject<Object3D | null>
  readonly intensity: number
  readonly normalBias?: number
  /** Sun position relative to the anchor: sets the light direction and distance. */
  readonly offset: [number, number, number]
  /** Half-size of the shadow box in metres — the radius that has shadows at all. */
  readonly radius?: number
  readonly resolution?: number
  /** PCF blur width in texels. */
  readonly softness?: number
}

export function SunShadow({
  bias = -0.0003,
  color,
  follow,
  intensity,
  normalBias = 0.02,
  offset,
  radius = 22,
  resolution = 4096,
  softness = 3.25,
}: SunShadowProps) {
  const light = useRef<DirectionalLight>(null)
  const centre = useRef(new Vector3())
  const cached = useCachedShadowsEnabled()

  useLayoutEffect(() => {
    const sun = light.current
    if (!sun) return
    const camera = sun.shadow.camera
    camera.left = -radius
    camera.right = radius
    camera.top = radius
    camera.bottom = -radius
    // The box hangs off the light, so it must reach from the sun past the far
    // corner of the ground it covers.
    camera.near = 0.5
    camera.far = Math.hypot(offset[0], offset[1], offset[2]) + radius * 2
    camera.updateProjectionMatrix()
  }, [offset, radius])

  useFrame(() => {
    const sun = light.current
    const anchor = follow?.current?.position
    if (!sun || !anchor) return

    const texel = (radius * 2) / resolution
    // Cached shadows re-bake the entire static world every time this box moves,
    // so there the centre steps on a coarse grid — a whole multiple of the texel,
    // to keep the anti-crawl snapping — instead of chasing the anchor every
    // frame. The box then lags the anchor by at most half a step, far inside its
    // radius, and the bake runs a few times a second rather than 60.
    const step = cached ? texel * Math.max(1, Math.round(radius / 6 / texel)) : texel
    centre.current.set(Math.round(anchor.x / step) * step, 0, Math.round(anchor.z / step) * step)
    sun.position.set(centre.current.x + offset[0], offset[1], centre.current.z + offset[2])
    // The target is parentless, so its own world matrix is all three.js needs to
    // aim the shadow camera; it never has to live in the scene graph.
    sun.target.position.copy(centre.current)
    sun.target.updateMatrixWorld()
  })

  return (
    <directionalLight
      ref={light}
      castShadow
      color={color}
      intensity={intensity}
      position={offset}
      shadow-bias={bias}
      shadow-mapSize-height={resolution}
      shadow-mapSize-width={resolution}
      shadow-normalBias={normalBias}
      shadow-radius={softness}
    />
  )
}
