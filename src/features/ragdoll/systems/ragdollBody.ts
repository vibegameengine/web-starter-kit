import { Matrix4, Quaternion, Vector3 } from 'three'

import type { RagdollJoint, RagdollSegment, RagdollSpec } from './mixamoRig'

/**
 * A ragdoll as an OBJECT, not as a tree of components.
 *
 * This file owns the whole simulated body: it creates the rigid bodies, the
 * colliders and the joints, ramps the collapse, holds the support, decides when
 * the corpse is at rest, and writes the solver's result back onto the skeleton.
 * It has one owner by construction — nothing happens until someone calls
 * `step`/`syncToSkeleton`, and the order those run in is the caller's to state.
 *
 * Why that matters, concretely. Every rigid body used to be a `<RigidBody>` and
 * every joint a component with its own `useFrame`, which put FIFTEEN per-frame
 * subscriptions on one corpse — one doing real work and fourteen polling a ref
 * to notice a number had changed, because a component cannot be *told* anything.
 * Worse, r3f calls subscribers in mount order, so "does the animation write the
 * skeleton before or after the solver" was decided by React reconciliation. That
 * is not a thing to tune; it is a thing to remove.
 *
 * The two clocks are kept apart on purpose:
 *   - `step(dt)`      — simulation. Ramps, support, rest detection. Belongs on
 *                       the project's fixed tick (see the fixed-tick contract).
 *   - `syncToSkeleton()` — presentation. Reads the bodies, writes the bones.
 *                       Belongs on the render frame, because that is when the
 *                       mesh is drawn.
 * They are separate methods rather than one `update` so a caller cannot
 * accidentally put gameplay timing on a render delta, which is exactly what the
 * component version did with its buckle, relax and settle windows.
 *
 * Deliberately framework-free: no React, no r3f, and no import of the physics
 * package either — the engine is described by the narrow structural interfaces
 * below and handed in. That is what makes this extractable as its own module,
 * and it is also what stops a future edit from quietly reaching for a hook.
 */

// ── The physics surface this needs, and nothing more ────────────────────────
// Structural rather than imported: the project resolves two different copies of
// the physics package, so importing types from either one risks describing a
// different build than the objects actually handed in at runtime.

export type Vec3Like = { readonly x: number; readonly y: number; readonly z: number }
export type QuatLike = { readonly x: number; readonly y: number; readonly z: number; readonly w: number }

export interface PhysicsRigidBody {
  applyImpulse: (impulse: Vec3Like, wake: boolean) => void
  applyImpulseAtPoint: (impulse: Vec3Like, point: Vec3Like, wake: boolean) => void
  isDynamic: () => boolean
  isSleeping: () => boolean
  linvel: () => Vec3Like
  mass: () => number
  rotation: () => QuatLike
  setAngvel: (velocity: Vec3Like, wake: boolean) => void
  setEnabled: (enabled: boolean) => void
  setLinvel: (velocity: Vec3Like, wake: boolean) => void
  setRotation: (rotation: QuatLike, wake: boolean) => void
  setTranslation: (translation: Vec3Like, wake: boolean) => void
  sleep: () => void
  translation: () => Vec3Like
}

/** The raw joint set, which is how per-axis limits are reachable at all. */
type RawJointSet = {
  jointConfigureMotorVelocity: (handle: number, axis: number, targetVelocity: number, factor: number) => void
  jointSetLimits: (handle: number, axis: number, min: number, max: number) => void
}

export interface PhysicsJoint {
  readonly handle: number
  readonly rawSet: RawJointSet
  setContactsEnabled: (enabled: boolean) => void
  /** Present on revolute joints (a `UnitImpulseJoint`), absent on generic ones. */
  configureMotorPosition?: (target: number, stiffness: number, damping: number) => void
  setLimits?: (min: number, max: number) => void
}

type Chainable<T> = { [K in keyof T]: T[K] }

export interface PhysicsColliderDesc {
  setFriction: (friction: number) => Chainable<PhysicsColliderDesc>
  setMass: (mass: number) => Chainable<PhysicsColliderDesc>
  setRestitution: (restitution: number) => Chainable<PhysicsColliderDesc>
  setRotation: (rotation: QuatLike) => Chainable<PhysicsColliderDesc>
}

export interface PhysicsRigidBodyDesc {
  setAngularDamping: (damping: number) => Chainable<PhysicsRigidBodyDesc>
  setCanSleep: (can: boolean) => Chainable<PhysicsRigidBodyDesc>
  setLinearDamping: (damping: number) => Chainable<PhysicsRigidBodyDesc>
  setTranslation: (x: number, y: number, z: number) => Chainable<PhysicsRigidBodyDesc>
}

export interface PhysicsWorld {
  createCollider: (desc: PhysicsColliderDesc, parent: PhysicsRigidBody) => unknown
  createImpulseJoint: (
    data: unknown,
    parent: PhysicsRigidBody,
    child: PhysicsRigidBody,
    wake: boolean,
  ) => PhysicsJoint
  createRigidBody: (desc: PhysicsRigidBodyDesc) => PhysicsRigidBody
  removeImpulseJoint: (joint: PhysicsJoint, wake: boolean) => void
  removeRigidBody: (body: PhysicsRigidBody) => void
}

export interface PhysicsApi {
  ColliderDesc: { capsule: (halfHeight: number, radius: number) => PhysicsColliderDesc }
  JointData: {
    generic: (anchor1: Vec3Like, anchor2: Vec3Like, axis: Vec3Like, axesMask: number) => unknown
    revolute: (anchor1: Vec3Like, anchor2: Vec3Like, axis: Vec3Like) => unknown
  }
  RigidBodyDesc: { dynamic: () => PhysicsRigidBodyDesc }
}

// ── Tuning ─────────────────────────────────────────────────────────────────
// Every number here was measured on a real collapse; the reasoning that fixed
// each one is kept with it, because the values look arbitrary without it.

/**
 * Total body mass (kg). Each segment takes an explicit share from its
 * anthropometric `massFraction` rather than a uniform density — a uniform
 * density makes a thin torso weigh less than a stubby limb, which is backwards.
 */
const TOTAL_BODY_MASS = 75

/**
 * Flaccidity. Right after death the muscles go slack, so a limp body reaches
 * angles its owner never could — which is why a corpse held to living ROM looks
 * propped up, unable to loll its head back onto the ground. Ranges open over
 * `RELAX_TIME`: cones by `RELAX_GAIN`, hinges by `HINGE_GIVE` past straight.
 * Keep the hinge give SMALL — at ~11° the knees visibly turned inside out.
 */
const RELAX_TIME = 0.7
const RELAX_GAIN = 0.7
const HINGE_GIVE = 0.08

/**
 * The knee/elbow buckle reflex: how long the fold is driven after death and how
 * hard. Measured — at stiffness 90 the knee moved 0–2° (a stick); this drives a
 * ~45° fold, which reads as the legs giving way under 75 kg.
 */
const BUCKLE_TIME = 0.9
const BUCKLE_STIFFNESS = 2000
const BUCKLE_DAMPING = 150
/** The pull that finishes the movement once the reflex is spent — weak on purpose. */
const UNFOLD_STIFFNESS = 25
const UNFOLD_DAMPING = 10

/**
 * Rest is DISPLACEMENT over a whole window, not instantaneous speed. Sampling
 * speed froze limbs in mid-air: a limb creeping down can sit under any sane
 * speed threshold for the window and get slept while still unsupported. Over a
 * window that limb travels centimetres and fails; a body at rest moves nothing.
 */
const SETTLE_WINDOW = 0.8
const SETTLE_EPSILON = 0.01

/** Which parts bear the weight at the instant of death, and when they let go. */
const SUPPORT_CONTACT_BAND = 0.12
const SUPPORT_RELEASE_FRACTION = 0.55
const SUPPORT_GRIP_PER_SECOND = 12
/** How far the mass may sit off the support before the body counts as balanced. */
const LEAN_DEADZONE = 0.04
const LEAN_PUSH = 0.6

// JointAxesMask: X=1, Y=2, Z=4. Locking all three translations makes a pure ball
// joint; the angular axes stay free so they can be bounded below. RawJointAxis:
// AngX=3 is the twist about the joint's own X (the bone, or a hinge's axis),
// AngY=4 / AngZ=5 are the two swing axes perpendicular to it.
const LOCK_TRANSLATION = 1 | 2 | 4
const TWIST_AXIS = 3
const SWING_AXIS_A = 4
const SWING_AXIS_B = 5

/** How many steps the relax ramp is quantised into before it is re-applied. */
const RELAX_STEPS = 20

export type RagdollTelemetry = {
  /** Vertical spread of the rigid bodies: ~0.1–0.35 m lying, ~1.8 m standing. */
  readonly spanY: number
  /** Farthest body from the world origin, horizontally. */
  readonly farthestXZ: number
  readonly seconds: number
  readonly settled: boolean
}

type JointRuntime = {
  readonly spec: RagdollJoint
  readonly joint: PhysicsJoint
  lastCollapseStep: number
  lastRelaxStep: number
}

const scratchBodyWorld = new Matrix4()
const scratchTarget = new Matrix4()
const scratchParentInverse = new Matrix4()
const scratchPosition = new Vector3()
const scratchQuaternion = new Quaternion()
const scratchScale = new Vector3()
const scratchCentreOfMass = new Vector3()
const scratchSupport = new Vector3()
const scratchLean = new Vector3()
const ONE = new Vector3(1, 1, 1)

/**
 * One simulated body. Construct it with a spec measured off a skeleton; it is
 * inert (every body disabled, nothing simulated, nothing written) until `wake`.
 */
export class RagdollBody {
  readonly #spec: RagdollSpec
  readonly #world: PhysicsWorld
  readonly #bodies = new Map<string, PhysicsRigidBody>()
  readonly #joints: JointRuntime[] = []
  /** `body⁻¹ · bone` inverted once: waking needs `body = bone · bind⁻¹`. */
  readonly #bindInverse = new Map<string, Matrix4>()
  readonly #restMark = new Map<string, Vector3>()

  #active = false
  #disposed = false
  #deadSeconds = 0
  #collapse = 0
  #relax = 0
  #settleSeconds = 0
  #settled = false
  #support: string[] = []
  #standingHeight = 0
  #pending: { readonly point: Vector3; readonly impulse: Vector3 } | null = null

  constructor(world: PhysicsWorld, rapier: PhysicsApi, spec: RagdollSpec) {
    this.#world = world
    this.#spec = spec

    for (const segment of spec.segments) {
      // Created dynamic and immediately switched OFF. A disabled body is not in
      // the solver or the broad phase at all, so its type costs nothing while
      // parked — and creating it in its final type means waking is one
      // `setEnabled`, not a body-type change the solver has to absorb.
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(segment.center.x, segment.center.y, segment.center.z)
          .setAngularDamping(segment.angularDamping)
          .setLinearDamping(0.05)
          .setCanSleep(true) as PhysicsRigidBodyDesc,
      )
      body.setEnabled(false)
      // The body spawns unrotated and the COLLIDER carries the bone direction,
      // which is what makes every joint anchor a plain `world − center`.
      world.createCollider(
        rapier.ColliderDesc.capsule(segment.halfHeight, segment.radius)
          .setRotation(segment.orientation)
          .setMass(segment.massFraction * TOTAL_BODY_MASS)
          .setRestitution(0)
          .setFriction(0.9) as PhysicsColliderDesc,
        body,
      )
      this.#bodies.set(segment.id, body)
      this.#bindInverse.set(segment.id, new Matrix4().copy(segment.bind).invert())
    }

    for (const joint of spec.joints) {
      const parent = this.#bodies.get(joint.parent)
      const child = this.#bodies.get(joint.child)
      if (!parent || !child) continue
      const parentCentre = this.#centreOf(joint.parent)
      const childCentre = this.#centreOf(joint.child)
      if (!parentCentre || !childCentre) continue
      const anchorParent = joint.anchor.clone().sub(parentCentre)
      const anchorChild = joint.anchor.clone().sub(childCentre)
      const axis = joint.axis ?? new Vector3(0, 1, 0)

      const created = joint.kind === 'revolute'
        ? world.createImpulseJoint(rapier.JointData.revolute(anchorParent, anchorChild, axis), parent, child, true)
        : world.createImpulseJoint(
          rapier.JointData.generic(anchorParent, anchorChild, axis, LOCK_TRANSLATION),
          parent,
          child,
          true,
        )

      // Neighbouring capsules overlap by design (head/torso, torso/upper arm).
      // Left colliding they shove each other into poses a body cannot hold — the
      // head gets pushed chin-to-chest instead of falling back. Standard practice:
      // no contacts between two bodies a joint already constrains, except where
      // the limb must not pass THROUGH the trunk.
      created.setContactsEnabled(joint.kind === 'revolute' ? false : joint.contacts ?? false)

      if (joint.kind === 'revolute') {
        if (joint.limit) created.setLimits?.(joint.limit[0] - joint.rest, joint.limit[1] - joint.rest)
      } else {
        const raw = created.rawSet
        const twist = joint.twist ?? [0, 0]
        const swing = joint.swing ?? [0, 0]
        const swingSide = joint.swingSide ?? swing
        raw.jointSetLimits(created.handle, TWIST_AXIS, twist[0], twist[1])
        raw.jointSetLimits(created.handle, SWING_AXIS_A, swing[0], swing[1])
        raw.jointSetLimits(created.handle, SWING_AXIS_B, swingSide[0], swingSide[1])
        if (joint.damping && joint.damping > 0) {
          // A velocity motor with a zero target and no stiffness is a pure damper:
          // it resists rotation without pulling toward any angle. Limits alone
          // cannot calm a limb — they say where it may end up, not how freely it
          // gets there, which is why a light arm on a long lever whips inside a
          // range that is perfectly correct.
          raw.jointConfigureMotorVelocity(created.handle, TWIST_AXIS, 0, joint.damping)
          raw.jointConfigureMotorVelocity(created.handle, SWING_AXIS_A, 0, joint.damping)
          raw.jointConfigureMotorVelocity(created.handle, SWING_AXIS_B, 0, joint.damping)
        }
      }

      this.#joints.push({ spec: joint, joint: created, lastCollapseStep: -1, lastRelaxStep: -1 })
    }
  }

  get active(): boolean {
    return this.#active
  }

  /** True once every body has held still for a whole settle window. */
  get settled(): boolean {
    return this.#settled
  }

  /**
   * Hand the skeleton to the solver.
   *
   * Each body is put back under its OWN bone first. A parked body has been
   * standing where it was measured while the skeleton walked off across the
   * level; without this the first simulated frame has to drag it the whole
   * distance the animation covered, which reads as the corpse being flung from
   * wherever the character spawned.
   */
  wake(): void {
    if (this.#active || this.#disposed) return
    this.#active = true
    this.#deadSeconds = 0
    this.#collapse = 1
    this.#relax = 0
    this.#settleSeconds = 0
    this.#settled = false
    this.#restMark.clear()

    for (const segment of this.#spec.segments) {
      const body = this.#bodies.get(segment.id)
      if (!body) continue
      scratchTarget.multiplyMatrices(segment.bone.matrixWorld, this.#bindInverse.get(segment.id) ?? IDENTITY)
      scratchTarget.decompose(scratchPosition, scratchQuaternion, scratchScale)
      body.setEnabled(true)
      body.setTranslation({ x: scratchPosition.x, y: scratchPosition.y, z: scratchPosition.z }, true)
      body.setRotation(
        { x: scratchQuaternion.x, y: scratchQuaternion.y, z: scratchQuaternion.z, w: scratchQuaternion.w },
        true,
      )
      // A parked body carries no history worth keeping; a stale velocity here
      // would throw it on the frame it wakes.
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }

    this.#captureSupport()
  }

  /** Wakes if needed and drives an impulse at a world point (a shot, a blow). */
  hit(worldPoint: Vector3, impulse: Vector3): void {
    this.#pending = { impulse: impulse.clone(), point: worldPoint.clone() }
    this.wake()
  }

  /**
   * The simulation half: collapse ramps, the support, and rest detection.
   *
   * Everything here is gameplay timing and belongs on a fixed tick. Nothing in
   * it reads or writes the skeleton.
   */
  step(deltaSeconds: number): void {
    if (!this.#active || this.#disposed) return

    this.#deadSeconds += deltaSeconds
    this.#collapse = Math.max(0, 1 - this.#deadSeconds / BUCKLE_TIME)
    this.#relax = Math.min(1, this.#deadSeconds / RELAX_TIME)
    this.#driveJoints()
    this.#holdSupport()
    this.#detectRest(deltaSeconds)
    this.#applyPendingImpulse()
  }

  /**
   * The presentation half: read the bodies, write the bones.
   *
   * Runs on the render frame, because this is what decides where the mesh is
   * drawn. Skips entirely while the corpse sleeps — its bones already hold the
   * final pose, so there is nothing to read and nothing to write.
   */
  syncToSkeleton(): void {
    if (!this.#active || this.#disposed) return

    for (const segment of this.#spec.segments) {
      const body = this.#bodies.get(segment.id)
      if (!body || body.isSleeping()) continue
      const translation = body.translation()
      const rotation = body.rotation()
      scratchBodyWorld.compose(
        scratchPosition.set(translation.x, translation.y, translation.z),
        scratchQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w),
        ONE,
      )

      // Physics → skeleton: bone world = body world · bind, then to bone-local.
      scratchTarget.multiplyMatrices(scratchBodyWorld, segment.bind)
      const parent = segment.bone.parent
      if (parent) {
        // Refresh the parent from the locals set THIS frame. three only refreshes
        // `matrixWorld` inside `gl.render`, which is later, so reading it here
        // would localise against last frame's parent pose and twitch every child
        // of a moving parent. Segments are ordered root→leaf, so every driven
        // ancestor already has its local set.
        parent.updateWorldMatrix(true, false)
        scratchTarget.premultiply(scratchParentInverse.copy(parent.matrixWorld).invert())
      }
      scratchTarget.decompose(segment.bone.position, segment.bone.quaternion, segment.bone.scale)
    }
  }

  /** The spread of the rigid bodies — the honest answer to "did it settle". */
  telemetry(): RagdollTelemetry {
    let low = Infinity
    let high = -Infinity
    let far = 0
    for (const segment of this.#spec.segments) {
      const body = this.#bodies.get(segment.id)
      if (!body) continue
      const position = body.translation()
      low = Math.min(low, position.y)
      high = Math.max(high, position.y)
      far = Math.max(far, Math.hypot(position.x, position.z))
    }
    return {
      farthestXZ: Number.isFinite(far) ? far : 0,
      seconds: this.#deadSeconds,
      settled: this.#settled,
      spanY: Number.isFinite(high - low) ? high - low : 0,
    }
  }

  /** Removes every joint and body from the world. Idempotent. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#active = false
    for (const entry of this.#joints) this.#world.removeImpulseJoint(entry.joint, false)
    for (const body of this.#bodies.values()) this.#world.removeRigidBody(body)
    this.#joints.length = 0
    this.#bodies.clear()
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  #centreOf(id: string): Vector3 | null {
    return this.#spec.segments.find((segment) => segment.id === id)?.center ?? null
  }

  /**
   * The joint ramps, driven rather than polled.
   *
   * Each joint is re-configured only when its quantised ramp value actually
   * moves, so the whole collapse costs a handful of calls — the same economy the
   * component version bought with fourteen per-frame subscriptions, except here
   * the owner simply calls the joint instead of leaving a number for it to find.
   */
  #driveJoints(): void {
    const relaxStep = Math.round(this.#relax * RELAX_STEPS)
    const collapseStep = Math.round(this.#collapse * RELAX_STEPS)

    for (const entry of this.#joints) {
      const { spec, joint } = entry

      if (spec.kind === 'revolute') {
        // The buckle reflex: for a moment after death the knee/elbow is driven
        // toward its folded angle, so the legs give way and the body SINKS
        // instead of toppling like a plank. The motor fades out, leaving a fully
        // passive joint. It pulls each hinge along its own bend axis only, so it
        // cannot splay the body the way a whole-pose hold would.
        if (spec.buckle !== undefined && collapseStep !== entry.lastCollapseStep) {
          entry.lastCollapseStep = collapseStep
          if (this.#collapse > 0) {
            joint.configureMotorPosition?.(
              spec.buckle - spec.rest,
              this.#collapse * BUCKLE_STIFFNESS,
              this.#collapse * BUCKLE_DAMPING,
            )
          } else {
            // Once the reflex is spent, ease the hinge back toward straight. A
            // folded knee turns out to be a stable resting state — measured, the
            // shins parked 18 cm off the floor at zero velocity and slept there.
            // This pull is the weight of a slack limb finishing the movement, and
            // it is far too soft to straighten a leg the body is lying on.
            joint.configureMotorPosition?.(-spec.rest, UNFOLD_STIFFNESS, UNFOLD_DAMPING)
          }
        }

        // Flaccidity, hinge flavour: a limp knee/elbow gives a little PAST
        // straight. Only the neutral end opens — widening the fold end would do
        // nothing (it already folds further than flesh allows) and letting it
        // swing backwards freely would read as a broken limb.
        if (spec.relaxable && spec.limit && relaxStep !== entry.lastRelaxStep) {
          entry.lastRelaxStep = relaxStep
          const give = (relaxStep / RELAX_STEPS) * HINGE_GIVE
          // The knee folds negative and the elbow positive, so which end is
          // "straight" cannot be assumed — it is whichever sits nearer zero.
          const straightIsLower = Math.abs(spec.limit[0]) < Math.abs(spec.limit[1])
          joint.setLimits?.(
            spec.limit[0] - spec.rest - (straightIsLower ? give : 0),
            spec.limit[1] - spec.rest + (straightIsLower ? 0 : give),
          )
        }
        continue
      }

      if (!spec.relaxable || relaxStep === entry.lastRelaxStep) continue
      entry.lastRelaxStep = relaxStep
      const gain = 1 + (relaxStep / RELAX_STEPS) * RELAX_GAIN
      const twist = spec.twist ?? [0, 0]
      const swing = spec.swing ?? [0, 0]
      const swingSide = spec.swingSide ?? swing
      const raw = joint.rawSet
      raw.jointSetLimits(joint.handle, TWIST_AXIS, twist[0] * gain, twist[1] * gain)
      raw.jointSetLimits(joint.handle, SWING_AXIS_A, swing[0] * gain, swing[1] * gain)
      raw.jointSetLimits(joint.handle, SWING_AXIS_B, swingSide[0] * gain, swingSide[1] * gain)
    }
  }

  /**
   * The body's real centre of mass, from where its parts are and what they
   * weigh. Measured rather than assumed to sit on the spine, so a differently
   * built creature topples the way ITS mass hangs.
   */
  #centreOfMass(out: Vector3): Vector3 {
    out.set(0, 0, 0)
    let total = 0
    for (const segment of this.#spec.segments) {
      const body = this.#bodies.get(segment.id)
      if (!body) continue
      const mass = body.mass()
      const position = body.translation()
      out.x += position.x * mass
      out.y += position.y * mass
      out.z += position.z * mass
      total += mass
    }
    return total > 0 ? out.divideScalar(total) : out
  }

  /**
   * Which parts carry the weight at the instant of death. Deliberately NOT "the
   * feet": the bearing parts are whatever is actually lowest, so a body caught
   * mid-step, kneeling or leaning pivots about what is really carrying it.
   */
  #captureSupport(): void {
    let lowest = Infinity
    for (const segment of this.#spec.segments) {
      const body = this.#bodies.get(segment.id)
      if (!body) continue
      lowest = Math.min(lowest, body.translation().y - segment.radius)
    }
    this.#support = this.#spec.segments
      .filter((segment) => {
        const body = this.#bodies.get(segment.id)
        return body ? body.translation().y - segment.radius <= lowest + SUPPORT_CONTACT_BAND : false
      })
      .map((segment) => segment.id)
    this.#standingHeight = this.#centreOfMass(scratchCentreOfMass).y
  }

  /** Horizontal centre of the parts currently bearing the weight. */
  #supportCentre(out: Vector3): Vector3 {
    out.set(0, 0, 0)
    let count = 0
    for (const id of this.#support) {
      const body = this.#bodies.get(id)
      if (!body) continue
      const position = body.translation()
      out.x += position.x
      out.z += position.z
      count += 1
    }
    return count > 0 ? out.divideScalar(count) : out
  }

  /**
   * A body does not start falling all at once: whatever bears its weight stays
   * put and the rest topples AROUND it, like a pole going over. Released as soon
   * as the body is down, because once it is lying, gravity presses every part
   * alike and each part's own weight settles the pose.
   */
  #holdSupport(): void {
    if (this.#support.length === 0) return

    const centre = this.#centreOfMass(scratchCentreOfMass)
    if (centre.y < this.#standingHeight * SUPPORT_RELEASE_FRACTION) {
      this.#support = []
      return
    }

    // Topple the way the mass already leans. Standing, the line of gravity does
    // not run down the body's axis — it falls AHEAD of the ankle, which is why
    // an unconscious body pitches over rather than folding straight down. Below
    // the deadzone the body is balanced on a knife edge no real one stands on,
    // so it gets the anatomical forward bias.
    const base = this.#supportCentre(scratchSupport)
    scratchLean.set(centre.x - base.x, 0, centre.z - base.z)
    if (scratchLean.lengthSq() < LEAN_DEADZONE * LEAN_DEADZONE) {
      const pelvis = this.#bodies.get(this.#spec.segments[0]?.id ?? '')
      if (!pelvis) return
      const rotation = pelvis.rotation()
      scratchLean
        .set(0, 0, 1)
        .applyQuaternion(scratchQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w))
      scratchLean.y = 0
    }
    if (scratchLean.lengthSq() > 1e-8) {
      // Push the part with the longest lever over the support — the top of the
      // body. Toppling is a torque about the support, so the highest mass leads.
      // Chosen by height rather than named, so a hunched creature is led by
      // whatever part of IT is really up there.
      let leader: PhysicsRigidBody | null = null
      let highest = -Infinity
      for (const segment of this.#spec.segments) {
        const body = this.#bodies.get(segment.id)
        if (!body) continue
        const y = body.translation().y
        if (y > highest) {
          highest = y
          leader = body
        }
      }
      scratchLean.normalize().multiplyScalar(LEAN_PUSH)
      leader?.applyImpulse({ x: scratchLean.x, y: 0, z: scratchLean.z }, true)
    }

    // Grip, not glue: bleed off the horizontal drift of the bearing parts so
    // they do not slide out from under the body, while leaving them free to
    // rotate and to be driven down by the weight above.
    //
    // KNOWN WRONG, and reproduced deliberately: the 0.016 is a hardcoded 60 Hz
    // frame, so at 144 Hz this bleeds off roughly three times as much speed as
    // intended. It is left exactly as it was because this change is structural —
    // moving the ragdoll out of the component tree — and altering the physics in
    // the same step would make the before/after settle rates incomparable. It
    // goes when the corrective writes go.
    const grip = Math.max(0, 1 - SUPPORT_GRIP_PER_SECOND * 0.016)
    for (const id of this.#support) {
      const body = this.#bodies.get(id)
      if (!body || body.isSleeping()) continue
      const velocity = body.linvel()
      body.setLinvel({ x: velocity.x * grip, y: velocity.y, z: velocity.z * grip }, true)
    }
  }

  /**
   * Force the settled ragdoll to sleep. A joint island rarely quiesces on its
   * own — residual constraint energy keeps limbs micro-moving just above the
   * solver's sleep threshold, so a corpse would simulate forever.
   */
  #detectRest(deltaSeconds: number): void {
    this.#settleSeconds += deltaSeconds
    let moved = 0
    for (const segment of this.#spec.segments) {
      const body = this.#bodies.get(segment.id)
      if (!body) continue
      const position = body.translation()
      const mark = this.#restMark.get(segment.id)
      if (!mark) {
        this.#restMark.set(segment.id, new Vector3(position.x, position.y, position.z))
        continue
      }
      moved = Math.max(moved, mark.distanceTo(scratchPosition.set(position.x, position.y, position.z)))
    }
    if (this.#settleSeconds <= SETTLE_WINDOW) return

    if (moved < SETTLE_EPSILON) {
      this.#settled = true
      for (const segment of this.#spec.segments) this.#bodies.get(segment.id)?.sleep()
    }
    // Re-anchor whether or not it settled, so the next window measures fresh
    // movement rather than drift accumulated since the body died.
    this.#settleSeconds = 0
    for (const segment of this.#spec.segments) {
      const body = this.#bodies.get(segment.id)
      if (!body) continue
      const position = body.translation()
      this.#restMark.set(segment.id, new Vector3(position.x, position.y, position.z))
    }
  }

  #applyPendingImpulse(): void {
    const queued = this.#pending
    if (!queued) return
    let nearestId: string | null = null
    let nearest = Infinity
    for (const segment of this.#spec.segments) {
      const distance = segment.center.distanceToSquared(queued.point)
      if (distance < nearest) {
        nearest = distance
        nearestId = segment.id
      }
    }
    const body = nearestId ? this.#bodies.get(nearestId) : null
    if (!body?.isDynamic()) return
    body.applyImpulseAtPoint(
      { x: queued.impulse.x, y: queued.impulse.y, z: queued.impulse.z },
      { x: queued.point.x, y: queued.point.y, z: queued.point.z },
      true,
    )
    this.#pending = null
  }
}

const IDENTITY = new Matrix4()

/** Kept exported so a caller can reason about a segment without the class. */
export type { RagdollSegment }
