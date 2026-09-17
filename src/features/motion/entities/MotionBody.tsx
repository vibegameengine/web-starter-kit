import { useRef } from 'react'
import type { ReactNode } from 'react'
import type { Group } from 'three'

import { useInterpolatedMotion } from '../components/useInterpolatedMotion'
import type { MotionTimeline } from '../components/useMotionController'
import type { Vector3Tuple } from '../systems/boxTrace'

export type MotionBodyProps = {
  readonly children?: ReactNode
  readonly collider?: Vector3Tuple
  readonly timeline: React.MutableRefObject<MotionTimeline>
}

export function MotionBody({ children, collider, timeline }: MotionBodyProps) {
  const group = useRef<Group>(null)
  useInterpolatedMotion(group, timeline)

  return (
    <group ref={group}>
      {collider ? (
        <mesh>
          <boxGeometry args={[collider[0] * 2, collider[1] * 2, collider[2] * 2]} />
          <meshBasicMaterial color="#59f0b0" wireframe />
        </mesh>
      ) : null}
      {children}
    </group>
  )
}
