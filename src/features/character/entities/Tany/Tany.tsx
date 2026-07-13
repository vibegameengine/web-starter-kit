import { useRef } from 'react'
import type { Group } from 'three'

import { type TanyAnimation, useTanyRig } from './useTanyRig'

export type { TanyAnimation } from './useTanyRig'

interface TanyProps {
  position?: [number, number, number]
  rotationY?: number
  scale?: number
  isDancing?: boolean
  /** Explicit debug animation; otherwise gameplay derives it from `isDancing`. */
  animation?: TanyAnimation
}

/**
 * ECS "entity": the real Tany character — a Mixamo-rigged, animated Tripo GLB.
 * Rendered with the painted runtime material. Its imported idle and untouched
 * Mixamo dance actions cross-fade according to gameplay or an explicit debug mode.
 */
export function Tany({ position = [0, 0, 0], rotationY = 0, scale = 1, isDancing = false, animation }: TanyProps) {
  const group = useRef<Group>(null)
  const scene = useTanyRig(group, animation ?? (isDancing ? 'dance' : 'idle'))

  return (
    <group ref={group} position={position} rotation-y={rotationY} scale={scale}>
      <primitive object={scene} />
    </group>
  )
}
