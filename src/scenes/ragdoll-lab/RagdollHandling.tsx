import { useFrame, useStore, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { Plane, Quaternion, SkinnedMesh, Vector2, Vector3 } from 'three'

import type { RagdollApi } from '../../features/ragdoll/entities/Ragdoll'
import type { RagdollLabActions } from './labActions'

/**
 * Everything you can DO to the body in this lab: grab a limb and drag it, fling
 * it, spin it, tumble it, shoot it, or drop it where it stands.
 *
 * All of it reaches the bodies through the rapier world, not through the ragdoll:
 * the ragdoll's own rigid bodies are in that world, so a raycast finds the limb
 * under the cursor without the feature having to grow a picking API for the
 * bench's benefit (`dev-lab-authoring` rule 1 — the lab consumes the feature,
 * the feature never grows a lab-shaped hole).
 *
 * The one thing it does ask the ragdoll for is to WAKE: a body that is still
 * being posed by the animation has every collider disabled, so there is nothing
 * in the world to grab yet. Grabbing therefore knocks the body out first and
 * retries the pick for a few frames while the solver takes the skeleton over —
 * which is also the interaction you want, since a limp body is the only kind you
 * can drag.
 */

/**
 * The rapier types, derived from the context instead of imported.
 *
 * `@react-three/rapier` carries its OWN copy of `@dimforge/rapier3d-compat`, and
 * another version is hoisted to the root of node_modules. Importing the types by
 * package name picks whichever copy resolves first, and the two are structurally
 * incompatible — so every call below fails to typecheck against objects that are
 * the right objects at runtime. Reading the types off `useRapier` cannot pick the
 * wrong copy: they come from the world the hook actually hands out.
 */
type RapierWorld = ReturnType<typeof useRapier>['world']
type RapierRigidBody = ReturnType<RapierWorld['createRigidBody']>
type RapierJoint = ReturnType<RapierWorld['createImpulseJoint']>

/** Newton-metre-seconds. Enough to whip a limp body round, not to launch it. */
const SPIN_IMPULSE = 26
const TUMBLE_IMPULSE = 20
/** Newton-seconds per body. Applied to every segment, so the body flies whole. */
const LAUNCH_IMPULSE = 4.2
/** A shot at the cursor, as in the original bench. */
const HIT_STRENGTH = 60
const AIM_HEIGHT = 1
/** How long a queued action keeps looking for bodies to act on, in seconds. */
const PENDING_WINDOW = 0.6

type Grab = {
  readonly body: RapierRigidBody
  readonly anchor: RapierRigidBody
  readonly joint: RapierJoint
  /** The drag plane: camera-facing, through the point that was grabbed. */
  readonly plane: Plane
}

type PendingPick = { readonly clientX: number; readonly clientY: number; readonly seconds: number }
type PendingImpulse = {
  readonly apply: (bodies: readonly RapierRigidBody[]) => void
  readonly seconds: number
}

const scratchRayOrigin = new Vector3()
const scratchRayDirection = new Vector3()
const scratchPoint = new Vector3()
const scratchLocal = new Vector3()
const scratchNdc = new Vector2()
const scratchRotation = new Quaternion()
const scratchBone = new Vector3()
const scratchOnRay = new Vector3()

/**
 * The ragdoll's own segments, and nothing else in the world.
 *
 * Thrown shapes are dynamic too, and spinning them along with the body would
 * make "spin" mean "stir the room". They are told apart by the `userData` tag
 * their rigid body carries, which is the only marker that survives the trip
 * through rapier.
 */
function ragdollSegments(world: RapierWorld): RapierRigidBody[] {
  const segments: RapierRigidBody[] = []
  world.forEachRigidBody((body) => {
    if (!body.isDynamic() || !body.isEnabled()) return
    const userData = body.userData as { readonly kind?: string } | undefined
    if (userData?.kind === 'projectile') return
    segments.push(body)
  })
  return segments
}

type RagdollHandlingProps = {
  readonly actionsRef: MutableRefObject<RagdollLabActions>
  readonly apiRef: RefObject<RagdollApi | null>
}

export function RagdollHandling({ actionsRef, apiRef }: RagdollHandlingProps) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const { rapier, world } = useRapier()
  // The camera controls are reached through the STORE, not subscribed to with
  // `useThree`: pausing them is a mutation of someone else's object, and a value
  // read during render must not be written to afterwards. Read at call time it is
  // an ordinary local — and it is also correct, since the controls mount after
  // this component and a subscribed value would have been null on first grab.
  const store = useStore()

  /** Pause the orbit camera for the length of a drag, if a stage provided one. */
  const setCameraEnabled = useCallback(
    (enabled: boolean) => {
      const controls = store.getState().controls as { enabled: boolean } | null
      if (controls) controls.enabled = enabled
    },
    [store],
  )

  const grab = useRef<Grab | null>(null)
  const pendingPick = useRef<PendingPick | null>(null)
  const pendingImpulse = useRef<PendingImpulse | null>(null)
  const cursor = useRef({ x: 0, y: 0 })

  /** Screen point → world ray, written into the module scratches. */
  const rayFrom = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      scratchNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      scratchRayOrigin.setFromMatrixPosition(camera.matrixWorld)
      scratchRayDirection.set(scratchNdc.x, scratchNdc.y, 0.5).unproject(camera).sub(scratchRayOrigin).normalize()
    },
    [camera, gl],
  )

  /** The limb under the cursor, or null. Fixed ground and asleep debris included. */
  const pickBody = useCallback(
    (clientX: number, clientY: number): { readonly body: RapierRigidBody; readonly point: Vector3 } | null => {
      rayFrom(clientX, clientY)
      const ray = new rapier.Ray(scratchRayOrigin, scratchRayDirection)
      const hit = world.castRay(ray, 120, true, undefined, undefined, undefined, undefined, (collider) => {
        const parent = collider.parent()
        return parent !== null && parent.isDynamic()
      })
      if (!hit) return null
      const body = hit.collider.parent()
      if (!body) return null
      const point = scratchRayOrigin.clone().addScaledVector(scratchRayDirection, hit.timeOfImpact)
      return { body, point }
    },
    [rapier, rayFrom, world],
  )

  const releaseGrab = useCallback(() => {
    const held = grab.current
    grab.current = null
    if (held) {
      // The joint goes first. Removing the anchor while a joint still references
      // it leaves rapier holding a handle to a body that no longer exists, and
      // the crash lands on a later step where nothing points back to here.
      world.removeImpulseJoint(held.joint, true)
      world.removeRigidBody(held.anchor)
    }
    setCameraEnabled(true)
  }, [setCameraEnabled, world])

  const beginGrab = useCallback(
    (body: RapierRigidBody, point: Vector3) => {
      const anchor = world.createRigidBody(
        rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x, point.y, point.z),
      )
      // The grab point in the limb's OWN frame, or the body would swing itself
      // round to put its origin under the cursor instead of the spot you took
      // hold of.
      const translation = body.translation()
      const rotation = body.rotation()
      scratchRotation.set(rotation.x, rotation.y, rotation.z, rotation.w).invert()
      scratchLocal
        .set(point.x - translation.x, point.y - translation.y, point.z - translation.z)
        .applyQuaternion(scratchRotation)

      const joint = world.createImpulseJoint(
        rapier.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: scratchLocal.x, y: scratchLocal.y, z: scratchLocal.z }),
        anchor,
        body,
        true,
      )

      // A plane facing the camera through the grab point: dragging then moves the
      // limb across the view, which is what a pointer can actually express. A
      // horizontal plane would send it to the horizon the moment you aimed up.
      const normal = new Vector3()
      camera.getWorldDirection(normal)
      grab.current = { anchor, body, joint, plane: new Plane().setFromNormalAndCoplanarPoint(normal, point) }
      setCameraEnabled(false)
    },
    [camera, rapier, setCameraEnabled, world],
  )

  /**
   * Does the cursor sit over the drawn character at all?
   *
   * Measured against the SKELETON — the distance from the ray to the nearest
   * bone — and not with a mesh raycast. A skinned mesh is placed on the GPU by
   * its bones, so three's raycast against it tests the bind-pose geometry behind
   * a bounding volume computed once at load: on a posed, collapsing body it
   * misses the arm you are clearly pointing at and, worse, misses silently. The
   * bones are where the body actually IS, in world space, this frame.
   */
  const overCharacter = useCallback(
    (clientX: number, clientY: number): boolean => {
      rayFrom(clientX, clientY)
      let nearest = Number.POSITIVE_INFINITY
      scene.traverse((object) => {
        const skinned = object as SkinnedMesh
        if (!skinned.isSkinnedMesh || !skinned.skeleton) return
        for (const bone of skinned.skeleton.bones) {
          bone.getWorldPosition(scratchBone)
          const along = scratchBone.clone().sub(scratchRayOrigin).dot(scratchRayDirection)
          if (along <= 0) continue
          scratchOnRay.copy(scratchRayOrigin).addScaledVector(scratchRayDirection, along)
          nearest = Math.min(nearest, scratchBone.distanceTo(scratchOnRay))
        }
      })
      // Roughly a limb's radius. Tighter and a click on the forearm counts as a
      // miss; looser and the camera can no longer be orbited from beside the body.
      return nearest < 0.3
    },
    [rayFrom, scene],
  )

  // --- pointer: grab, drag, fling ------------------------------------------
  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      cursor.current = { x: event.clientX, y: event.clientY }

      const picked = pickBody(event.clientX, event.clientY)
      if (picked) {
        beginGrab(picked.body, picked.point)
        return
      }

      // Nothing dynamic under the cursor. If the cursor is over the character it
      // is still standing, so knock it out and keep trying for a few frames —
      // otherwise leave the event alone and let the camera have it.
      if (!overCharacter(event.clientX, event.clientY)) return
      apiRef.current?.activate()
      pendingPick.current = { clientX: event.clientX, clientY: event.clientY, seconds: 0 }
      setCameraEnabled(false)
    }

    const onPointerMove = (event: PointerEvent) => {
      cursor.current = { x: event.clientX, y: event.clientY }
      const held = grab.current
      if (!held) return
      rayFrom(event.clientX, event.clientY)
      const denominator = held.plane.normal.dot(scratchRayDirection)
      if (Math.abs(denominator) < 1e-6) return
      const distance = -(held.plane.normal.dot(scratchRayOrigin) + held.plane.constant) / denominator
      if (distance <= 0) return
      scratchPoint.copy(scratchRayOrigin).addScaledVector(scratchRayDirection, distance)
      // Never below the floor: dragged under it, the limb fights the ground
      // collider and the whole body buzzes instead of following the cursor.
      held.anchor.setNextKinematicTranslation({ x: scratchPoint.x, y: Math.max(0.05, scratchPoint.y), z: scratchPoint.z })
    }

    // Letting go mid-drag IS the throw: the limb has been carrying the anchor's
    // velocity all along, so removing the joint simply stops holding it back.
    const onPointerUp = () => {
      pendingPick.current = null
      releaseGrab()
    }

    // Capture, so the camera controls — which listen on the same element — see a
    // pointer-down that has already been disabled when it is theirs to ignore.
    canvas.addEventListener('pointerdown', onPointerDown, { capture: true })
    canvas.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true })
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      releaseGrab()
    }
  }, [apiRef, beginGrab, gl, overCharacter, pickBody, rayFrom, releaseGrab, setCameraEnabled])

  // --- the verbs -----------------------------------------------------------
  /**
   * Queue an impulse against the ragdoll's segments.
   *
   * Queued rather than applied, because the body may still be standing: waking
   * it happens on the ragdoll's own fixed tick, and an impulse pushed at a
   * disabled body is silently dropped. So the intent is held for a few frames
   * until there is something to push.
   */
  const queue = useCallback(
    (apply: (bodies: readonly RapierRigidBody[]) => void) => {
      apiRef.current?.activate()
      const bodies = ragdollSegments(world)
      if (bodies.length > 0) {
        apply(bodies)
        return
      }
      pendingImpulse.current = { apply, seconds: 0 }
    },
    [apiRef, world],
  )

  const spin = useCallback(
    (sign: number) => {
      queue((bodies) => {
        for (const body of bodies) {
          body.applyTorqueImpulse({ x: 0, y: (SPIN_IMPULSE * sign) / bodies.length, z: 0 }, true)
        }
      })
    },
    [queue],
  )

  const tumble = useCallback(
    (sign: number) => {
      // About the camera's RIGHT axis, so a tumble always looks like a forward
      // roll from where you are standing rather than along a world axis you
      // cannot see.
      const axis = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
      queue((bodies) => {
        const strength = (TUMBLE_IMPULSE * sign) / bodies.length
        for (const body of bodies) {
          body.applyTorqueImpulse({ x: axis.x * strength, y: 0, z: axis.z * strength }, true)
        }
      })
    },
    [camera, queue],
  )

  const launch = useCallback(() => {
    const direction = new Vector3()
    camera.getWorldDirection(direction)
    // Up and away, not into the floor: aimed flat, the body just scrapes along
    // the ground and the flight — the thing being watched — never happens.
    direction.setY(0).normalize().setY(0.55).normalize()
    queue((bodies) => {
      for (const body of bodies) {
        body.applyImpulse(
          { x: direction.x * LAUNCH_IMPULSE, y: direction.y * LAUNCH_IMPULSE, z: direction.z * LAUNCH_IMPULSE },
          true,
        )
      }
    })
  }, [camera, queue])

  useEffect(() => {
    actionsRef.current = { ...actionsRef.current, launch, spin, tumble }
  }, [actionsRef, launch, spin, tumble])

  // --- keys ----------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      switch (event.code) {
        case 'Space': {
          // The shot stays on a key rather than a button: the mouse belongs to
          // the camera and to the grab, and a left-click shot would fire on
          // every attempt to orbit.
          event.preventDefault()
          rayFrom(cursor.current.x, cursor.current.y)
          const toPlane = (AIM_HEIGHT - scratchRayOrigin.y) / scratchRayDirection.y
          if (toPlane <= 0) return
          const point = scratchRayOrigin.clone().addScaledVector(scratchRayDirection, toPlane)
          apiRef.current?.hit(point, scratchRayDirection.clone().setLength(HIT_STRENGTH))
          return
        }
        case 'KeyK':
          apiRef.current?.activate()
          return
        case 'KeyQ':
          spin(1)
          return
        case 'KeyE':
          spin(-1)
          return
        case 'KeyZ':
          tumble(1)
          return
        case 'KeyX':
          tumble(-1)
          return
        case 'KeyG':
          launch()
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [apiRef, launch, rayFrom, spin, tumble])

  // --- the retry window ----------------------------------------------------
  useFrame((_, delta) => {
    const pick = pendingPick.current
    if (pick) {
      // Aged by REPLACING the queued record rather than by mutating it: the
      // object was read out of a ref during a frame callback, and writing into it
      // in place is the kind of hidden mutation react's compiler cannot see.
      const waited = pick.seconds + delta
      const picked = pickBody(pick.clientX, pick.clientY)
      if (picked) {
        pendingPick.current = null
        beginGrab(picked.body, picked.point)
      } else if (waited > PENDING_WINDOW) {
        pendingPick.current = null
        setCameraEnabled(true)
      } else {
        pendingPick.current = { ...pick, seconds: waited }
      }
    }

    const impulse = pendingImpulse.current
    if (impulse) {
      const waited = impulse.seconds + delta
      const bodies = ragdollSegments(world)
      if (bodies.length > 0) {
        pendingImpulse.current = null
        impulse.apply(bodies)
      } else if (waited > PENDING_WINDOW) {
        pendingImpulse.current = null
      } else {
        pendingImpulse.current = { ...impulse, seconds: waited }
      }
    }
  })

  return null
}
