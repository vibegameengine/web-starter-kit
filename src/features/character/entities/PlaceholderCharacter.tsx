import { useRef } from 'react'
import type { Group } from 'three'

import { useBob } from '../../../shared/lib/useBob'
import { useSpin } from '../../../shared/lib/useSpin'

interface PlaceholderCharacterProps {
  position?: [number, number, number]
}

/**
 * ECS "entity": a React component that IS a game being. A greybox capsule stand-
 * in until a real rigged character lands — all its behaviour comes from attached
 * components (hooks): `useSpin` turns the body, `useBob` makes it hover. Swap the
 * meshes for a GLB later without touching how behaviour is composed.
 */
export function PlaceholderCharacter({ position = [0, 0, 0] }: PlaceholderCharacterProps) {
  const hoverRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)

  useBob(hoverRef, { amplitude: 0.12, frequency: 0.6, base: 1.1 })
  useSpin(bodyRef, { speed: 0.25 })

  return (
    <group position={position}>
      <group ref={hoverRef}>
        <group ref={bodyRef}>
          {/* torso */}
          <mesh castShadow>
            <capsuleGeometry args={[0.35, 0.9, 8, 16]} />
            <meshStandardMaterial color="#b5533a" roughness={0.7} metalness={0.05} />
          </mesh>
          {/* head */}
          <mesh castShadow position={[0, 0.95, 0]}>
            <sphereGeometry args={[0.28, 24, 24]} />
            <meshStandardMaterial color="#e8c79a" roughness={0.6} />
          </mesh>
          {/* nose — an asymmetric marker on +Z so the useSpin rotation is
              actually visible (a bare capsule/sphere is a surface of revolution
              and looks identical while spinning). */}
          <mesh castShadow position={[0, 0.95, 0.27]}>
            <coneGeometry args={[0.07, 0.18, 12]} />
            <meshStandardMaterial color="#c98a5a" roughness={0.6} />
          </mesh>
          {/* arms — reinforce the read of rotation. */}
          <mesh castShadow position={[0.4, 0.15, 0]} rotation-z={-0.35}>
            <capsuleGeometry args={[0.1, 0.4, 6, 12]} />
            <meshStandardMaterial color="#9c452f" roughness={0.75} />
          </mesh>
          <mesh castShadow position={[-0.4, 0.15, 0]} rotation-z={0.35}>
            <capsuleGeometry args={[0.1, 0.4, 6, 12]} />
            <meshStandardMaterial color="#9c452f" roughness={0.75} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
