import { useThree } from '@react-three/fiber'
import { BallCollider, CapsuleCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { Vector3 } from 'three'

import type { RagdollApi } from '../../features/ragdoll/entities/Ragdoll'
import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import type { RagdollLabActions } from './labActions'
import type { ProjectileShape, ProjectileShapeId } from './projectileShapes'
import { projectileMaterial, projectileShapeFrom } from './projectileShapes'

/**
 * The throwing arm: solid shapes launched at the body from wherever you are
 * looking.
 *
 * A shot leaves from just in front of the CAMERA rather than from a fixed muzzle,
 * because the whole point is to aim by orbiting: you put the view where you want
 * the blow to come from and throw from there. It is aimed at a horizontal plane
 * at chest height, the same plane the shot in `RagdollHandling` uses, so a throw
 * and a shot at the same cursor land in the same place.
 *
 * Projectiles are a FIXED-LENGTH ring, never an unbounded list. Left to grow, a
 * few minutes of play puts a hundred sleeping bodies in the solver and the lab
 * starts to stutter for reasons that have nothing to do with the ragdoll.
 */

/** How many stay in the world. The oldest is dropped when the ring is full. */
const MAX_LIVE = 14
/** Metres per second. Fast enough to spin a limb, slow enough to watch. */
const THROW_SPEED = 11
/** Chest height: the plane a throw is aimed at. */
const AIM_HEIGHT = 1
/** Spawn offset from the camera, so the shape is visible the moment it appears. */
const MUZZLE_FORWARD = 0.9
const MUZZLE_DROP = 0.25

const EMPTY: readonly Projectile[] = []

type Projectile = {
  readonly id: number
  readonly origin: readonly [number, number, number]
  readonly shape: ProjectileShape
  readonly velocity: readonly [number, number, number]
}

type ThrownShapesProps = {
  readonly actionsRef: MutableRefObject<RagdollLabActions>
  /** Throwing knocks the body out, so there is something solid to hit. */
  readonly apiRef: RefObject<RagdollApi | null>
  /** Which shape the next throw uses. */
  readonly shapeId: ProjectileShapeId
  /** Bumping this clears the world of everything thrown so far. */
  readonly runId: number
}

function Collider({ shape }: { readonly shape: ProjectileShape }) {
  const { collider } = shape
  switch (collider.kind) {
    case 'ball':
      return <BallCollider args={[collider.radius]} mass={shape.mass} />
    case 'capsule':
      return <CapsuleCollider args={[collider.halfHeight, collider.radius]} mass={shape.mass} />
    case 'cuboid':
      return <CuboidCollider args={[...collider.halfExtents]} mass={shape.mass} />
    case 'cylinder':
      return <CylinderCollider args={[collider.halfHeight, collider.radius]} mass={shape.mass} />
  }
}

export function ThrownShapes({ actionsRef, apiRef, runId, shapeId }: ThrownShapesProps) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  /**
   * The live shapes, STAMPED with the run they belong to.
   *
   * A reset stands a fresh body up, so it has to take the debris with it —
   * otherwise the new run starts knee-deep in the last one's boxes. Clearing them
   * in an effect would mean rendering one frame of the new run with the old run's
   * boxes still in it and then re-rendering, so the run is compared during render
   * instead: a stale batch is simply never read.
   */
  // eslint-disable-next-line no-restricted-syntax -- one entry per throw, written by a pointer or a key press; mounting the new body is what the render is for. Their per-frame motion is physics, not state.
  const [batch, setBatch] = useState<{ readonly items: readonly Projectile[]; readonly runId: number }>({
    items: [],
    runId,
  })
  const live = batch.runId === runId ? batch.items : EMPTY
  /** Where the pointer was last seen, so the key and the button agree on a target. */
  const cursor = useRef<{ x: number; y: number } | null>(null)

  const throwAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = gl.domElement
      const rect = canvas.getBoundingClientRect()
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1

      const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld)
      const direction = new Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(eye).normalize()

      // Aim at chest height. A ray that climbs never crosses the plane, and a
      // throw with no target would fly off over the stage — better to refuse it.
      const toPlane = (AIM_HEIGHT - eye.y) / direction.y
      if (toPlane <= 0) return
      const target = eye.clone().addScaledVector(direction, toPlane)

      // Throwing WAKES the body. While the ragdoll is switched off every one of
      // its colliders is disabled, so a shape does not bounce off a standing
      // mannequin — it sails straight through it, and the lab looks broken while
      // being perfectly correct. A thrown object is a blow, and a blow is exactly
      // what puts this body on the floor.
      apiRef.current?.activate()

      const origin = eye.clone().addScaledVector(direction, MUZZLE_FORWARD)
      origin.y -= MUZZLE_DROP
      const velocity = target.clone().sub(origin).normalize().multiplyScalar(THROW_SPEED)

      setBatch((previous) => {
        const kept = previous.runId === runId ? previous.items : EMPTY
        const shape = projectileShapeFrom(shapeId)
        // The id is the source of the react key AND has to be unique for the
        // whole session: reusing an index would let react keep the previous
        // body's mesh, and the new shape would inherit the old one's transform.
        const id = (kept[kept.length - 1]?.id ?? 0) + 1
        const next: Projectile = {
          id,
          origin: [origin.x, origin.y, origin.z],
          shape,
          velocity: [velocity.x, velocity.y, velocity.z],
        }
        const room = kept.length >= MAX_LIVE ? kept.slice(kept.length - MAX_LIVE + 1) : kept
        return { items: [...room, next], runId }
      })
    },
    [apiRef, camera, gl, runId, shapeId],
  )

  /** Throw at the cursor, or at the middle of the view before it has moved. */
  const throwAtCursor = useCallback(() => {
    const canvas = gl.domElement
    const rect = canvas.getBoundingClientRect()
    const aim = cursor.current ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    throwAt(aim.x, aim.y)
  }, [gl, throwAt])

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerMove = (event: PointerEvent) => {
      cursor.current = { x: event.clientX, y: event.clientY }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.repeat) return
      throwAtCursor()
    }

    canvas.addEventListener('pointermove', onPointerMove)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [gl, throwAtCursor])

  useEffect(() => {
    actionsRef.current = { ...actionsRef.current, throwShape: throwAtCursor }
  }, [actionsRef, throwAtCursor])

  return (
    // Movers, so the cached shadow rig redraws them instead of baking them into
    // the world's shadow and leaving a box-shaped stain where one flew past.
    <ShadowGroup kind="dynamic">
      {live.map((projectile) => (
        <RigidBody
          angularDamping={0.2}
          // Small and fast: without continuous collision detection a shape at
          // 13 m/s tunnels straight through a limb capsule between two steps.
          ccd
          colliders={false}
          key={projectile.id}
          linearVelocity={[...projectile.velocity]}
          position={[...projectile.origin]}
          type="dynamic"
          userData={{ kind: 'projectile' }}
        >
          <Collider shape={projectile.shape} />
          <mesh castShadow geometry={projectile.shape.geometry} material={projectileMaterial} receiveShadow />
        </RigidBody>
      ))}
    </ShadowGroup>
  )
}
