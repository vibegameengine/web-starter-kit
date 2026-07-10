import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { Group, Mesh, Object3D, Quaternion, Vector3 } from 'three'

import tanyUrl from '../assets/models/tany-3.glb'

useGLTF.preload(tanyUrl)

interface TanyRigProps {
  position?: [number, number, number]
  rotationY?: number
  /** Source model is ~1.7 units tall with feet at the origin. */
  scale?: number
  /** Clip name to play; `null` → default (bind) pose. */
  activeClip?: string | null
  /** Fires once with the GLB's available clip names. */
  onClips?: (names: string[]) => void
}

interface BindTransform {
  node: Object3D
  position: Vector3
  quaternion: Quaternion
  scale: Vector3
}

/**
 * ECS entity: the real Tany rig (tany-3.glb) for the character debug screen.
 * Loads the skinned GLB, reports its animation clips, and either plays the
 * selected clip or restores the model's imported default pose. Behaviour (which
 * clip) is driven from the debug screen — the entity just owns the rig + mixer.
 */
export function TanyRig({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  activeClip = null,
  onClips,
}: TanyRigProps) {
  const group = useRef<Group>(null)
  const bindPose = useRef<BindTransform[]>([])
  const { scene, animations } = useGLTF(tanyUrl)

  // Mixamo clips carry hip (root) translation that drifts the character across
  // (and out of) the frame. Pin the horizontal X/Z of every position track to
  // its first sample so clips play IN PLACE, but KEEP Y so the standing height
  // and vertical bob survive. Joint rotations are untouched.
  const clips = useMemo(
    () =>
      animations.map((clip) => {
        const inPlace = clip.clone()
        for (const track of inPlace.tracks) {
          if (!track.name.endsWith('.position')) continue
          const values = track.values
          const baseX = values[0]
          const baseZ = values[2]
          for (let i = 0; i < values.length; i += 3) {
            values[i] = baseX // pin X
            values[i + 2] = baseZ // pin Z — keep values[i + 1] (Y)
          }
        }
        return inPlace
      }),
    [animations],
  )

  const { actions } = useAnimations(clips, group)

  useLayoutEffect(() => {
    // Snapshot the imported (bind) local transform of every node up front — this
    // is the true "default pose". `skeleton.pose()` collapses this retargeted
    // rig, so we restore from this snapshot instead.
    const snapshot: BindTransform[] = []
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false // skinned meshes cull against the bind bbox
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
    onClips?.(clips.map((clip) => clip.name))
  }, [clips, onClips])

  useEffect(() => {
    const active = activeClip ? actions[activeClip] : null

    if (active) {
      // Cross-fade from any other clip into the selected one.
      for (const name of Object.keys(actions)) {
        if (name !== activeClip) actions[name]?.fadeOut(0.25)
      }
      active.reset().fadeIn(0.25).play()
      return
    }

    // Default pose: stop the mixer and restore the imported bind transforms.
    for (const name of Object.keys(actions)) actions[name]?.stop()
    for (const entry of bindPose.current) {
      entry.node.position.copy(entry.position)
      entry.node.quaternion.copy(entry.quaternion)
      entry.node.scale.copy(entry.scale)
    }
  }, [activeClip, actions])

  return (
    <group ref={group} position={position} rotation-y={rotationY} scale={scale}>
      <primitive object={scene} />
    </group>
  )
}
