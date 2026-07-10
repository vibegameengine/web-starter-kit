import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import type { Object3D } from 'three'

import { spinAngle, type SpinOptions } from './motion'

/**
 * ECS "component": a React hook that drives a steady Y-spin on whatever entity
 * ref you hand it. This is the Unity-MonoBehaviour analogue — attach it to any
 * entity (character, prop, pickup) to give it spin behaviour, no inheritance.
 */
export function useSpin(ref: RefObject<Object3D | null>, options?: SpinOptions): void {
  useFrame((state) => {
    const object = ref.current
    if (!object) return
    object.rotation.y = spinAngle(state.clock.elapsedTime, options)
  })
}
