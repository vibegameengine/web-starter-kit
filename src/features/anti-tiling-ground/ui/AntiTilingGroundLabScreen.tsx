import { LabStage } from '../../../scenes/lab-stage/LabStage'
import { ShadowGroup } from '../../../shared/lib/ShadowGroup'
import { antiTilingGroundGeometries, antiTilingGroundMaterials } from '../materials/antiTilingGroundResources'

/**
 * The bench for the anti-tiling ground material — the base the layered terrain
 * stack is built on (`features/terrain-layers`).
 *
 * The ground is ONE continuous 44 m mesh on purpose. A tiled material only
 * betrays itself over distance: split the same surface into plates and every
 * plate's own repeat hides inside its own edge, so the thing this lab exists to
 * show cannot be seen. Walk the orbit out to the far corner and there is no
 * repeating motif to find — the per-cell quarter turn, offset and tone are
 * applied in WORLD space, so the pattern never lines up with itself.
 *
 * The three boxes are scale and shadow markers, not a level: without something
 * of a known size casting onto it, a ground plane has no distance and the
 * tiling question has no scale to be asked at.
 */

type GroundMarker = {
  readonly position: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
}

const GROUND_MARKERS: readonly GroundMarker[] = [
  { position: [-6.5, 1.25, -4.2], scale: [4.4, 2.5, 3.2] },
  { position: [0.5, 0.7, 1.6], scale: [2.8, 1.4, 2.8] },
  { position: [6.8, 1.8, -2.8], scale: [3.2, 3.6, 4.1] },
]

export function AntiTilingGroundLabScreen() {
  return (
    <LabStage
      camera={{ far: 200, fov: 42, near: 0.1, position: [15, 16, 19] }}
      // The stage's own floor and grid are OFF because the floor IS the subject
      // here: a second plane at y = 0 z-fights with it, and the reference grid
      // draws a repeating pattern across the one surface whose whole claim is
      // that it has none.
      grid={false}
      ground={false}
      orbit={{ maxDistance: 44, minDistance: 8, target: [0, 0.5, -1] }}
      post="rich"
      sun={{ radius: 26 }}
    >
      <ShadowGroup kind="static">
        <mesh
          geometry={antiTilingGroundGeometries.ground}
          material={antiTilingGroundMaterials.ground}
          receiveShadow
          rotation-x={-Math.PI / 2}
        />
        {GROUND_MARKERS.map((marker) => (
          <mesh
            castShadow
            geometry={antiTilingGroundGeometries.marker}
            key={marker.position.join('-')}
            material={antiTilingGroundMaterials.marker}
            position={marker.position}
            receiveShadow
            scale={marker.scale}
          />
        ))}
      </ShadowGroup>
    </LabStage>
  )
}
