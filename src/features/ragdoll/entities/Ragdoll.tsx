import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Box3, Object3D, SkinnedMesh, Vector3 } from 'three'

import { useFixedTick } from '../../../shared/lib/simulation/fixedTickContext'
import { buildRagdollSpec } from '../systems/mixamoRig'
import { RagdollBody, type PhysicsApi, type PhysicsWorld } from '../systems/ragdollBody'

/**
 * The CONNECTOR, and nothing else.
 *
 * Everything the ragdoll actually does lives in `systems/ragdollBody.ts` as a
 * plain object. This file's whole job is to hand that object the physics world,
 * give it its TWO clocks, and take it away again on unmount — the three things
 * React is genuinely for here.
 *
 * Two clocks, because the system is deliberately split into two halves and this
 * is the file that decides which half runs when (see the header of
 * `systems/ragdollBody.ts`):
 *   - `step()` is the simulation — the buckle reflex, the flaccidity ramp, the
 *     support hold and rest detection. It rides the HOST'S FIXED TICK. It used
 *     to take the render delta, which meant a 300 ms hitch drove the collapse
 *     ramp straight to zero (the knees never buckled and the body toppled like a
 *     plank) and could push the settle window past its threshold, force-sleeping
 *     a corpse in mid-air.
 *   - `syncToSkeleton()` is presentation — read the bodies, write the bones. It
 *     stays on the render frame, because that is the frame that draws the mesh.
 *
 * It used to be the other way round: every rigid body was a `<RigidBody>`, every
 * joint a component with its own `useFrame`, and one corpse carried fifteen
 * per-frame subscriptions of which fourteen only polled a ref to notice a number
 * had moved. There is now exactly one subscription per body, and the joints are
 * called rather than left a value to discover.
 */

export type RagdollApi = {
  /** Goes limp: bodies switch to dynamic and the skeleton follows the physics. */
  activate: () => void
  /** Activates and drives an impulse at a world point (shot/melee impact). */
  hit: (worldPoint: Vector3, impulse: Vector3) => void
}

type RagdollProps = {
  /** A cloned, skinned Mixamo model. Its bones drive the bodies, or vice versa. */
  readonly model: Object3D
  readonly apiRef?: RefObject<RagdollApi | null>
  /**
   * The switch. While false the ragdoll is genuinely OFF: every body is disabled
   * and nothing is simulated or synced, so the animation owns the skeleton
   * alone. When it (or `activate`) turns true, each body is placed back under
   * its own bone, goes dynamic, and drives the skeleton from then on.
   *
   * Note what this deliberately does NOT buy: a switched-off ragdoll has no
   * capsules in the world, so nothing can raycast against a living body's limbs.
   * Hit detection belongs to whatever the game already resolves shots with.
   */
  readonly active?: boolean
}

/**
 * A physics ragdoll for any Mixamo humanoid: a capsule rigid body per limb
 * joined by limited ball and hinge joints. Off by default and free while off;
 * switched on, it takes the skeleton over and collapses it under gravity.
 */
export function Ragdoll({ model, apiRef, active: activeProp }: RagdollProps) {
  const { rapier, world } = useRapier()
  const spec = useMemo(() => buildRagdollSpec(model), [model])
  const ragdoll = useRef<RagdollBody | null>(null)
  // eslint-disable-next-line no-restricted-syntax -- flips at most once per body, when a hit takes the skeleton over; going from animated to simulated IS a render.
  const [selfActive, setSelfActive] = useState(false)
  const active = activeProp ?? selfActive
  /** Queued while the body is still being built, applied as soon as it exists. */
  const pendingHit = useRef<{ readonly point: Vector3; readonly impulse: Vector3 } | null>(null)

  // The body owns real physics resources, so its lifetime is an effect and not a
  // memo: a memo may be discarded and recomputed without ever telling us, which
  // would leak eleven rigid bodies and ten joints into the world every time.
  useEffect(() => {
    if (!spec) return
    const body = new RagdollBody(world as unknown as PhysicsWorld, rapier as unknown as PhysicsApi, spec)
    ragdoll.current = body
    return () => {
      ragdoll.current = null
      body.dispose()
    }
  }, [rapier, spec, world])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      activate: () => setSelfActive(true),
      hit: (point, impulse) => {
        pendingHit.current = { impulse: impulse.clone(), point: point.clone() }
        setSelfActive(true)
      },
    }
    return () => {
      if (apiRef) apiRef.current = null
    }
  }, [apiRef])

  // DEV: what the solver was actually handed, per segment. A capsule that is
  // built in the wrong PLACE throws nothing and warns about nothing — it just
  // sits somewhere the mesh is not, and the spec still reports a full set of
  // segments. `boneToCentre` is the number that catches it: how far a body sits
  // from the bone it drives, taken from the bind tie so it does not depend on
  // whatever pose the model happens to be in when it is read.
  useEffect(() => {
    if (!import.meta.env.DEV || !spec) return
    const offset = new Vector3()
    ;(globalThis as Record<string, unknown>).__ragdollSegments = spec.segments.map((segment) => {
      offset.setFromMatrixPosition(segment.bind)
      return {
        boneToCentre: [-offset.x, -offset.y, -offset.z].map((value) => Number(value.toFixed(3))),
        drives: segment.bone.name,
        halfHeight: Number(segment.halfHeight.toFixed(3)),
        id: segment.id,
        radius: Number(segment.radius.toFixed(3)),
      }
    })
  }, [spec])

  // Skinned meshes must never frustum-cull: the ragdoll flings bones far past
  // the original bind bounds, and a culled mesh would vanish mid-flight.
  useEffect(() => {
    model.traverse((object) => {
      if ((object as SkinnedMesh).isSkinnedMesh) object.frustumCulled = false
    })
  }, [model])

  // The SIMULATION half, on the host's fixed tick. Waking and the queued impact
  // ride it too: both are gameplay events, and applying an impulse on a render
  // frame would make how hard a body is hit depend on how fast the machine draws.
  const ticked = useFixedTick((deltaSeconds) => {
    const body = ragdoll.current
    if (!body || !active) return

    const queued = pendingHit.current
    if (queued) {
      pendingHit.current = null
      body.hit(queued.point, queued.impulse)
    } else if (!body.active) {
      body.wake()
    }

    body.step(deltaSeconds)
  })

  // A ragdoll mounted under a host with no fixed tick would simply never
  // collapse, and it would do so silently. Said out loud in DEV rather than
  // quietly fixed with a render delta — that fallback IS the bug this removed.
  useEffect(() => {
    if (import.meta.env.DEV && !ticked) {
      console.error('Ragdoll: no FixedTickProvider above this body — it will never simulate.')
    }
  }, [ticked])

  // The PRESENTATION half, on the frame that draws. No render priority: any
  // priority above zero switches r3f into manual render mode, and a scene
  // without its own render pass then draws nothing at all.
  useFrame(() => {
    const body = ragdoll.current
    if (!body || !active) return

    body.syncToSkeleton()

    if (import.meta.env.DEV && spec) publishSpan(body, spec)
  })

  return <primitive object={model} />
}

const drawnAt = new Box3()
// Two scratches, not one. `Box3.getCentre`/`getSize` WRITE INTO the vector they
// are handed and return it, so sharing a scratch between them means the second
// call silently rewrites the first call's result — and if the two are read in
// the wrong order, the reported position is really the box's size. That is not
// hypothetical: it shipped here for an hour and made every corpse-position
// reading in `scripts/probe-*.mjs` a measurement of the wrong quantity.
const drawnCentre = new Vector3()
const drawnSize = new Vector3()
const drawnBone = new Vector3()

/**
 * DEV telemetry for the probes (`__ragdollSpan`).
 *
 * Two different questions, answered separately on purpose. The rigid bodies'
 * spread says whether the SIMULATION settled; the drawn box says where the body
 * is actually DRAWN — and the bodies are routinely perfect (settled, asleep, in
 * the right place) while the skeleton driven from them is a smear under the
 * world. A reading that cannot see the drawn body cannot answer for it.
 *
 * The drawn box is measured over the DRIVEN BONES, in world space, every frame.
 * It used to be `Box3.setFromObject(model)`, which is the wrong instrument here:
 * on a skinned mesh that describes the mesh NODE — a node whose transform the
 * renderer ignores, because the vertices are placed by the bones — so it
 * reported where the model was parented rather than where the corpse lay, and it
 * leans on a `boundingBox` three computes once and never invalidates.
 */
function publishSpan(body: RagdollBody, spec: NonNullable<ReturnType<typeof buildRagdollSpec>>): void {
  const telemetry = body.telemetry()
  drawnAt.makeEmpty()
  for (const segment of spec.segments) {
    segment.bone.getWorldPosition(drawnBone)
    drawnAt.expandByPoint(drawnBone)
  }
  const centre = drawnAt.getCenter(drawnCentre)
  const size = drawnAt.getSize(drawnSize).length()
  let worstBone = ''
  let worstDistance = 0
  let worstScale = 0
  for (const segment of spec.segments) {
    segment.bone.getWorldPosition(drawnBone)
    const distance = drawnBone.distanceTo(centre)
    if (distance > worstDistance) {
      worstDistance = distance
      worstBone = segment.bone.name
    }
    // Scale drift compounds down the chain: the write-back decomposes a matrix
    // into position, quaternion AND scale, and a scale that comes out wrong is
    // inherited by every bone below it.
    const { x, y, z } = segment.bone.scale
    worstScale = Math.max(worstScale, Math.abs(x - 1), Math.abs(y - 1), Math.abs(z - 1))
  }
  ;(globalThis as Record<string, unknown>).__ragdollSpan = {
    boneScaleDrift: Number(worstScale.toFixed(3)),
    drawnSize: Number(size.toFixed(2)),
    drawnX: Number(centre.x.toFixed(1)),
    drawnY: Number(centre.y.toFixed(2)),
    drawnZ: Number(centre.z.toFixed(1)),
    farthestXZ: Number(telemetry.farthestXZ.toFixed(2)),
    joints: spec.joints.length,
    segments: spec.segments.length,
    settled: telemetry.settled,
    spanY: Number(telemetry.spanY.toFixed(2)),
    worstBone,
    worstBoneAt: Number(worstDistance.toFixed(1)),
  }
}
