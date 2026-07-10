import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'

// `?albedo` drops every non-base-color map; `?texture=1024` caps it at 1024. The
// import resolves to the repacked/shrunk asset, not the 5.2 MB source.
import tanyUrl from '../assets/models/tany-3.glb?texture=1024&albedo&meshopt'

useGLTF.preload(tanyUrl)

interface TanyProps {
  position?: [number, number, number]
  rotationY?: number
  scale?: number
}

/**
 * ECS "entity": the real Tany character — a Mixamo-rigged, animated Tripo GLB.
 * Rendered with a flat unlit (base-color-only) material so it reads as "drawn"
 * rather than PBR-shaded, and its baked animation clip plays on a loop.
 */
export function Tany({ position = [0, 0, 0], rotationY = 0, scale = 1 }: TanyProps) {
  const group = useRef<Group>(null)
  const { scene, animations } = useGLTF(tanyUrl)
  const { actions, names } = useAnimations(animations, group)

  // Swap PBR materials for unlit base-color ones → painted look. Keep shadows.
  useLayoutEffect(() => {
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) {
        return
      }
      mesh.castShadow = true
      mesh.receiveShadow = false
      const source = mesh.material as MeshStandardMaterial
      const painted = new MeshBasicMaterial({
        map: source.map ?? null,
        color: source.color?.clone() ?? undefined,
        transparent: source.transparent,
        alphaTest: source.alphaTest,
        side: source.side,
        toneMapped: false,
      })
      mesh.material = painted
    })
  }, [scene])

  // Play the baked clip on a loop.
  useEffect(() => {
    const action = actions[names[0] ?? '']
    action?.reset().fadeIn(0.25).play()
    return () => {
      action?.fadeOut(0.25)
    }
  }, [actions, names])

  return (
    <group ref={group} position={position} rotation-y={rotationY} scale={scale}>
      <primitive object={scene} />
    </group>
  )
}
