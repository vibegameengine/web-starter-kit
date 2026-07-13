import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import type { Group, Object3D, Quaternion, Vector3 } from 'three'

import danceUrl from './assets/animations/macarena-dance.fbx'
import tanyUrl from './assets/models/tany-idle-mixamo-rigged.glb?texture=1024&albedo&meshopt'

useGLTF.preload(tanyUrl)
useGLTF.preload(danceUrl)

export type TanyAnimation = 'bind' | 'idle' | 'dance'

interface BindTransform {
  node: Object3D
  position: Vector3
  quaternion: Quaternion
  scale: Vector3
}

/**
 * Runtime rig for the single Tany entity. It loads the production model and
 * untouched Mixamo action, applies the painted runtime material, and switches
 * between bind, idle and dance without retargeting animation tracks.
 */
export function useTanyRig(group: RefObject<Group | null>, activeAnimation: TanyAnimation) {
  const bindPose = useRef<BindTransform[]>([])
  const { scene, animations } = useGLTF(tanyUrl)
  const { animations: danceAnimations } = useGLTF(danceUrl)
  const { actions: idleActions, names: idleNames } = useAnimations(animations, group)
  const { actions: danceActions, names: danceNames } = useAnimations(danceAnimations, group)

  const allActions = useMemo(() => [...Object.values(idleActions), ...Object.values(danceActions)], [danceActions, idleActions])

  useLayoutEffect(() => {
    const snapshot: BindTransform[] = []
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = false
        mesh.frustumCulled = false

        if (!(mesh.material instanceof MeshBasicMaterial)) {
          const source = mesh.material as MeshStandardMaterial
          mesh.material = new MeshBasicMaterial({
            map: source.map ?? null,
            color: source.color?.clone() ?? undefined,
            transparent: source.transparent,
            alphaTest: source.alphaTest,
            side: source.side,
            toneMapped: false,
          })
        }
      }

      snapshot.push({
        node: object,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
      })
    })
    bindPose.current = snapshot
  }, [scene])

  useEffect(() => {
    const idle = idleActions[idleNames[0] ?? '']
    const dance = danceActions[danceNames.find((name) => name === 'macarena') ?? danceNames[0] ?? '']

    if (activeAnimation === 'bind') {
      for (const action of allActions) action?.stop()
      for (const entry of bindPose.current) {
        entry.node.position.copy(entry.position)
        entry.node.quaternion.copy(entry.quaternion)
        entry.node.scale.copy(entry.scale)
      }
      return
    }

    const active = activeAnimation === 'dance' ? dance : idle
    const inactive = activeAnimation === 'dance' ? idle : dance
    inactive?.fadeOut(0.2)
    active?.reset().fadeIn(0.2).play()

    return () => {
      active?.fadeOut(0.2)
    }
  }, [activeAnimation, allActions, danceActions, danceNames, idleActions, idleNames])

  return scene
}
