import { CuboidCollider, RigidBody } from '@react-three/rapier'

/**
 * The few solid shapes every surface study is built from. Kept here so a sample
 * file is nothing but its own authored layout — the point of a sample is the shape
 * of the ground it puts under the body, not the boilerplate of a static collider.
 */

const GROUND_TONE = '#3a4048'
const RISER_TONE = '#454c56'

/** A level slab. `top` is the walking height, so a sample reads in the units it cares about. */
export function Slab({ position, size, top = 0, tone = GROUND_TONE }: {
  readonly position: readonly [number, number]
  readonly size: readonly [number, number]
  readonly top?: number
  readonly tone?: string
}) {
  const thickness = 1
  const centreY = top - thickness / 2
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[size[0] / 2, thickness / 2, size[1] / 2]} position={[position[0], centreY, position[1]]} />
      <mesh position={[position[0], centreY, position[1]]} receiveShadow>
        <boxGeometry args={[size[0], thickness, size[1]]} />
        <meshStandardMaterial color={tone} />
      </mesh>
    </RigidBody>
  )
}

/** A raised block: kerbs, walls, anything the body has to drape over or bridge. */
export function Riser({ position, size, tone = RISER_TONE }: {
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
  readonly tone?: string
}) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={position} />
      <mesh position={position} castShadow receiveShadow>
        <boxGeometry args={size as unknown as [number, number, number]} />
        <meshStandardMaterial color={tone} />
      </mesh>
    </RigidBody>
  )
}

/** A tilted slab. `tilt` is radians about Z, so positive drops the +X end. */
export function Ramp({ position, size, tilt, tone = '#414851' }: {
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
  readonly tilt: number
  readonly tone?: string
}) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={position} rotation={[0, 0, tilt]} />
      <mesh position={position} rotation={[0, 0, tilt]} receiveShadow castShadow>
        <boxGeometry args={size as unknown as [number, number, number]} />
        <meshStandardMaterial color={tone} />
      </mesh>
    </RigidBody>
  )
}
