import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { MeshStandardMaterial } from 'three'
import type { Mesh, Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import mannequinUrl from '../../ragdoll/assets/models/default-humanoid.fbx?fbx=raw'

const bodyMaterial = new MeshStandardMaterial({ color: '#b9743f', roughness: 0.72 })

export function useMannequinRig(floorOffset = 0): Object3D {
  const { scene } = useGLTF(mannequinUrl)
  return useMemo(() => {
    const rig = cloneSkinned(scene)
    rig.position.set(0, floorOffset, 0)
    rig.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) mesh.material = bodyMaterial
      mesh.frustumCulled = false
    })
    return rig
  }, [floorOffset, scene])
}
