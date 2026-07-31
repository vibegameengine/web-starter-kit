import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import type { RefObject } from 'react'
import { Mesh, MeshStandardMaterial } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import mannequinUrl from '../assets/models/default-humanoid.fbx?fbx=raw'
import { applyStartPose, START_POSES, type StartPose } from '../systems/startPoses'
import { Ragdoll, type RagdollApi } from './Ragdoll'

const bodyMaterial = new MeshStandardMaterial({ color: '#b9743f', roughness: 0.72 })

/**
 * A body built FOR the ragdoll bench. It is deliberately not the way a game
 * character dies: a living enemy already owns a posed, skinned mannequin, and it
 * hands that same object to `Ragdoll` (see `features/ai/entities/EnemyBody`)
 * rather than having a second one built here to match it.
 */
type RagdollCharacterProps = {
  readonly apiRef?: RefObject<RagdollApi | null>
  /** Standing pose the body collapses FROM. Defaults to the model's bare T-pose. */
  readonly pose?: StartPose
}

/** The project's Mixamo mannequin as a physics ragdoll — the reference rig for the system. */
export function RagdollCharacter({ apiRef, pose = START_POSES[0] }: RagdollCharacterProps) {
  const { scene } = useGLTF(mannequinUrl)
  // Pose the clone BEFORE `Ragdoll` reads the skeleton — the bodies are built from
  // bone world transforms, so the pose has to exist by then, not be applied after.
  const model = useMemo(() => {
    const clone = cloneSkinned(scene)
    applyStartPose(clone, pose)
    return clone
  }, [scene, pose])

  useEffect(() => {
    model.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.material = bodyMaterial
      mesh.castShadow = true
    })
  }, [model])

  return <Ragdoll model={model} apiRef={apiRef} />
}
