import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import type { AnimationClip, Group, Object3D, Quaternion, Vector3 } from 'three'

import danceUrl from './assets/animations/macarena-dance.fbx'
import greetingUrl from './assets/animations/Standing Greeting.fbx'
import tanyUrl from './assets/models/tany-idle-mixamo-rigged.glb?texture=1024&albedo&meshopt'

useGLTF.preload(tanyUrl)
useGLTF.preload(danceUrl)
useGLTF.preload(greetingUrl)

export type TanyAnimation = 'bind' | 'idle' | 'dance' | 'greeting'

interface BindTransform {
  node: Object3D
  position: Vector3
  quaternion: Quaternion
  scale: Vector3
}

/**
 * Runtime rig for the single Tany entity. It loads the production model and
 * untouched Mixamo actions, applies the painted runtime material, and switches
 * between bind, idle and actions without retargeting animation tracks.
 */
export function useTanyRig(
  group: RefObject<Group | null>,
  activeAnimation: TanyAnimation,
  onGreetingFinished?: () => void,
) {
  const bindPose = useRef<BindTransform[]>([])
  const greetingCompleted = useRef(false)
  const greetingFinishedRef = useRef(onGreetingFinished)
  const { scene, animations } = useGLTF(tanyUrl)
  const { animations: danceAnimations } = useGLTF(danceUrl)
  const { animations: greetingAnimations } = useGLTF(greetingUrl)
  // One mixer owns every clip for this one skeleton. Separate mixers overwrite
  // each other's output and can leave the character in the bind pose.
  // Cloning changes only the in-memory clip label; imported FBX tracks stay exact.
  const clips = useMemo(() => {
    const namedClip = (clip: AnimationClip | undefined, name: TanyAnimation): AnimationClip | null => {
      if (!clip) return null
      const runtimeClip = clip.clone()
      runtimeClip.name = name
      return runtimeClip
    }

    return [
      namedClip(animations[0], 'idle'),
      namedClip(danceAnimations.find((clip) => clip.name === 'macarena') ?? danceAnimations[0], 'dance'),
      namedClip(greetingAnimations[0], 'greeting'),
    ].filter((clip): clip is AnimationClip => clip !== null)
  }, [animations, danceAnimations, greetingAnimations])
  const { actions } = useAnimations(clips, group)

  useEffect(() => {
    greetingFinishedRef.current = onGreetingFinished
  }, [onGreetingFinished])

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
    const idle = actions.idle
    const dance = actions.dance
    const greeting = actions.greeting
    const allActions = [idle, dance, greeting]

    if (activeAnimation === 'bind') {
      for (const action of allActions) action?.stop()
      for (const entry of bindPose.current) {
        entry.node.position.copy(entry.position)
        entry.node.quaternion.copy(entry.quaternion)
        entry.node.scale.copy(entry.scale)
      }
      return
    }

    const active = activeAnimation === 'dance' ? dance : activeAnimation === 'greeting' ? greeting : idle
    for (const action of allActions) {
      if (action !== active) action?.fadeOut(0.2)
    }

    if (activeAnimation === 'greeting') {
      greetingCompleted.current = false
      active?.setLoop(LoopOnce, 1)
    } else {
      active?.setLoop(LoopRepeat, Infinity)
    }
    active?.reset().fadeIn(0.2).play()

    return () => {
      active?.fadeOut(0.2)
    }
  }, [activeAnimation, actions])

  useFrame(() => {
    const greeting = actions.greeting
    if (activeAnimation !== 'greeting' || !greeting || greetingCompleted.current) return
    if (greeting.time >= greeting.getClip().duration) {
      greetingCompleted.current = true
      greetingFinishedRef.current?.()
    }
  })

  return scene
}
