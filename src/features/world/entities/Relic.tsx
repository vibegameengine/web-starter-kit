import { useRef } from 'react'
import type { Group } from 'three'

import { useBob } from '../../../shared/lib/useBob'
import { useSpin } from '../../../shared/lib/useSpin'
import { crystal, geometries } from '../materials/materials'

interface RelicProps {
  /** Hover centre [x, y, z]; y is the height the relic bobs around. */
  position?: [number, number, number]
  scale?: number
}

/**
 * ECS entity: a floating arcane relic — a slowly spinning, gently hovering white
 * crystal shard that gives the canal a persistent focal point.
 * Geometry and material come from the shared registry (no inline `new`; see
 * threejs-instancing-materials); its behaviour is composed from the shared motion
 * components `useSpin` + `useBob`.
 */
export function Relic({ position = [0, 3, 0], scale = 1 }: RelicProps) {
  const [x, y, z] = position
  const hoverRef = useRef<Group>(null)
  const spinRef = useRef<Group>(null)

  useBob(hoverRef, { amplitude: 0.18, frequency: 0.35, base: y })
  useSpin(spinRef, { speed: 0.35 })

  return (
    <group position={[x, 0, z]}>
      <group ref={hoverRef}>
        <group ref={spinRef}>
          {/* Leaned inside the spinning group so it visibly tumbles (a shard
              spun about its own upright axis barely reads as moving). */}
          <mesh
            geometry={geometries.shard}
            material={crystal}
            scale={scale}
            rotation-z={0.5}
            castShadow
          />
        </group>
      </group>
    </group>
  )
}
