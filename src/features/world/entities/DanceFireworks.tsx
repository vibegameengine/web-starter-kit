import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

import { danceFireworksGeometries, danceFireworksMaterials } from '../materials/danceFireworksMaterials'

/** Three hand-composed, multi-layer firework blooms for the Macarena loop. */
export function DanceFireworks({ active }: { readonly active: boolean }) {
  const beganAt = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      beganAt.current = null
    }
  }, [active])

  useFrame((state) => {
    if (active) {
      beganAt.current ??= state.clock.elapsedTime
    }
    const time = active && beganAt.current !== null ? state.clock.elapsedTime - beganAt.current : -3.2
    danceFireworksMaterials.burst.uniforms.uTime.value = time
    danceFireworksMaterials.embers.uniforms.uTime.value = time + 0.42
    danceFireworksMaterials.launch.uniforms.uTime.value = time
  })

  if (!active) return null

  return (
    <group>
      {/* High gold crown: frames Tany without covering her silhouette. */}
      <points geometry={danceFireworksGeometries.launch} material={danceFireworksMaterials.launch} position={[2.2, 3.55, 2.2]} />
      <points geometry={danceFireworksGeometries.burst} material={danceFireworksMaterials.burst} position={[2.2, 3.55, 2.2]} />
      <points geometry={danceFireworksGeometries.embers} material={danceFireworksMaterials.embers} position={[2.2, 3.55, 2.2]} />
      {/* Cool right bloom adds depth behind the character. */}
      <points geometry={danceFireworksGeometries.launch} material={danceFireworksMaterials.launch} position={[5.2, 3.25, 1.0]} scale={0.72} />
      <points geometry={danceFireworksGeometries.burst} material={danceFireworksMaterials.burst} position={[5.2, 3.25, 1.0]} scale={0.72} />
      <points geometry={danceFireworksGeometries.embers} material={danceFireworksMaterials.embers} position={[5.2, 3.25, 1.0]} scale={0.72} />
      {/* Small left echo balances the frame, deliberately kept above the canal. */}
      <points geometry={danceFireworksGeometries.launch} material={danceFireworksMaterials.launch} position={[-0.2, 3.1, 2.8]} scale={0.52} />
      <points geometry={danceFireworksGeometries.burst} material={danceFireworksMaterials.burst} position={[-0.2, 3.1, 2.8]} scale={0.52} />
    </group>
  )
}
