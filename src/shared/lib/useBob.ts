import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import type { Object3D } from 'three'

import { bobHeight, type BobOptions } from './motion'

/**
 * ECS "component": a React hook that bobs any entity ref up and down. Like
 * `useSpin`, it attaches behaviour to an existing entity rather than baking it
 * into the entity's own component tree.
 */
export function useBob(ref: RefObject<Object3D | null>, options?: BobOptions): void {
  useFrame((state) => {
    const object = ref.current
    if (!object) return
    object.position.y = bobHeight(state.clock.elapsedTime, options)
  })
}
