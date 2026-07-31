import { Bone, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import type { Skeleton, SkinnedMesh } from 'three'

/**
 * A physics ragdoll built from a standard Mixamo humanoid skeleton. The bone
 * names are matched case-insensitively and with any namespace prefix stripped
 * (`mixamorig:LeftArm` → `leftarm`), so ANY Mixamo rig maps without edits.
 */

export type RagdollJointKind = 'cone' | 'revolute'

/** One capsule body spanning a bone toward its child, in world space. */
export type RagdollSegment = {
  readonly id: string
  /** Bone this body drives (the segment head). */
  readonly bone: Bone
  /** Midpoint of the capsule (rigid-body spawn position), world space. */
  readonly center: Vector3
  /** Rotation aligning the collider's local +Y with the bone direction. */
  readonly orientation: Quaternion
  readonly halfHeight: number
  readonly radius: number
  /** Share of total body mass for this segment (anthropometric; segments sum to 1). */
  readonly massFraction: number
  /** Angular damping for this body — arms need far more than the trunk. */
  readonly angularDamping: number
  /**
   * Bone pose expressed in the BODY's frame: `body⁻¹ · bone`, taken here, where
   * the two are guaranteed to describe the same instant.
   *
   * Measured at build time rather than read off the live rigid body later,
   * because the two do not agree at any later moment worth trusting. This
   * function runs while the model may still be detached from the scene, so its
   * "world" transforms are really local; the rigid body, meanwhile, is created
   * under whatever ancestors the host happens to have. Sampling both on the
   * first frame therefore bakes the host's offset into the tie — a body eight
   * metres to one side of a lab, or wherever a player happens to be standing —
   * and the corpse is then simulated somewhere the mesh is not.
   */
  readonly bind: Matrix4
}

/** A joint connecting a parent segment to a child segment at a world anchor. */
export type RagdollJoint = {
  readonly id: string
  readonly parent: string
  readonly child: string
  readonly anchor: Vector3
  readonly kind: RagdollJointKind
  /** World axis: the revolute hinge axis, or a cone joint's twist axis (the bone). */
  readonly axis?: Vector3
  /** Revolute hinge angular limits (rad) — stops elbow/knee hyperextension. */
  readonly limit?: readonly [number, number]
  /**
   * How bent this hinge already is at build time. Rapier measures from the pose the
   * joint was created in, so on a bent start pose every angle has to be offset by
   * this to stay anatomical. Zero for a straight limb.
   */
  readonly rest: number
  /** Cone twist limits (rad) about `axis` — stops a ball joint spinning freely. */
  readonly twist?: readonly [number, number]
  /** Cone swing limits (rad) on the first axis perpendicular to `axis`. */
  readonly swing?: readonly [number, number]
  /**
   * Swing limits on the SECOND perpendicular axis, defaulting to `swing`. Splitting
   * the two is what stops the splits: a hip flexes far but abducts little, and a
   * single symmetric cone lets a leg swing sideways exactly as far as it swings
   * forward — so a collapsing body slides its legs apart instead of folding.
   */
  readonly swingSide?: readonly [number, number]
  /**
   * Whether the two jointed bodies collide. Off by default because neighbouring
   * capsules overlap at the joint and would shove each other apart; on where the
   * limb must not pass THROUGH the trunk (hips, shoulders), which is what made the
   * body look like it was sinking into itself.
   */
  readonly contacts?: boolean
  /**
   * Viscous resistance in the joint itself — a damper that opposes rotation without
   * pulling toward any angle. Body damping alone cannot do this job: an arm is a
   * light link on a long lever, so with a free shoulder it whips around like a rope
   * no matter how heavy the trunk is. Real shoulder tissue drags on the movement,
   * and this is that drag. Set per joint, so arms are calmed without touching legs.
   */
  readonly damping?: number
  /**
   * Target hinge angle (rad) this joint briefly drives toward at death so the legs
   * GIVE WAY — a real person's knees buckle and the body sinks before it topples,
   * which a purely passive ragdoll (a rigid inverted pendulum) never does. Only the
   * knees set this; strength fades to 0 right after, then the joint is fully passive.
   */
  readonly buckle?: number
  /**
   * Whether this joint goes slack when the body dies. Only the extremities and the
   * neck do: relaxing the shoulders, hips and spine as well let the trunk fold into
   * shapes no body holds. The head and the limb ends are where a corpse visibly
   * gives — the head lolls back, the knees and elbows sag past their living stop.
   */
  readonly relaxable?: boolean
}

export type RagdollSpec = {
  readonly segments: readonly RagdollSegment[]
  readonly joints: readonly RagdollJoint[]
}

// Segment table by normalized bone name: [id, head, tail(for length/dir), radiusFactor, massFraction].
// radius = radiusFactor × bone length, keeping the ragdoll scale-independent. massFraction is the
// segment's share of total body mass from Winter's body-segment parameters (Dempster cadaver data):
// a uniform density makes a thin torso weigh less than a stubby limb, which is wrong — real bodies
// carry ~half their mass in the trunk. Fractions below sum to 1.0; our torso+pelvis split the trunk
// (thorax+abdomen vs pelvis), lowerArm folds in the hand, shin folds in the foot.
// Trailing value is angular damping. Arms are the lightest links on the longest
// levers, so with one damping for the whole body they whip around while the trunk
// barely moves — a corpse's arms swing, but they do not flail. Damping them harder
// stands in for the drag of shoulder tissue the joint limits alone do not provide.
const SEGMENTS: readonly (readonly [string, string, string, number, number, number])[] = [
  ['pelvis', 'hips', 'spine', 0.42, 0.142, 0.05],
  ['torso', 'spine1', 'neck', 0.34, 0.355, 0.05],
  ['head', 'head', 'headtop_end', 0.7, 0.081, 0.1],
  ['upperArmL', 'leftarm', 'leftforearm', 0.32, 0.028, 1.2],
  ['lowerArmL', 'leftforearm', 'lefthand', 0.28, 0.022, 1.0],
  ['upperArmR', 'rightarm', 'rightforearm', 0.32, 0.028, 1.2],
  ['lowerArmR', 'rightforearm', 'righthand', 0.28, 0.022, 1.0],
  ['thighL', 'leftupleg', 'leftleg', 0.32, 0.10, 0.15],
  ['shinL', 'leftleg', 'leftfoot', 0.26, 0.061, 0.15],
  ['thighR', 'rightupleg', 'rightleg', 0.32, 0.10, 0.15],
  ['shinR', 'rightleg', 'rightfoot', 0.26, 0.061, 0.15],
]

/**
 * Segments whose capsule is NOT the plain bone fit, because the bone is not the
 * shape. Everything else spans its own bone: an upper arm IS the bone from
 * shoulder to elbow, so half the bone length is its half-length and that is that.
 *
 * The head is not. Its bone runs from the base of the skull to the crown, while
 * the skull hangs off BOTH ends of it — measured on the mannequin's own mesh
 * (every vertex whose dominant skin weight is the `Head` joint, taken in that
 * bone's frame): 0.160 wide × 0.259 tall × 0.248 deep, centred 0.075 above the
 * bone, with the jaw 0.055 BELOW it, against a bone only 0.196 long.
 *
 * No radius factor can express that. The generic fit takes half-length from the
 * bone, so a radius large enough to cover a 0.26-tall skull always exceeds it,
 * the half-height clamps to its floor, and the "capsule" degenerates to a sphere
 * — which is what the head has been since it was written: a Ø 0.274 ball, wider
 * than the shoulders it sits between and shorter than the skull it stands for.
 *
 * So the head carries its own fit, still as FACTORS OF THE BONE LENGTH, which is
 * what keeps the rig scale-independent: every Mixamo humanoid shares these
 * proportions whatever its authored height.
 */
type CapsuleFit = {
  /** Capsule radius ÷ bone length. */
  readonly radius: number
  /** Half the capsule's total length along the bone ÷ bone length. */
  readonly halfLength: number
  /** Centre, in the BONE's own frame, ÷ bone length — not necessarily on the bone. */
  readonly centre: readonly [number, number, number]
}

const CAPSULE_FIT: Readonly<Record<string, CapsuleFit>> = {
  // Straight off the measurement, divided by the 0.196 bone: centre (0, 0.0746,
  // 0.0103), half-span along the bone 0.163, half-depth 0.124. The resulting
  // capsule is 0.248 × 0.327 — the skull's own envelope, front to occiput and jaw
  // to crown.
  //
  // It comes out nearly spherical, and that is the answer to "why is the head a
  // sphere": this head IS one, 0.16 × 0.26 × 0.25. What was wrong before was not
  // the shape but that nothing chose it — the radius exceeded half the bone, the
  // half-height hit its clamp, and a sphere fell out by accident, in the wrong
  // place and 60% too wide across the shoulders.
  head: { centre: [0, 0.38, 0.052], halfLength: 0.83, radius: 0.63 },
}

const deg = (degrees: number): number => (degrees * Math.PI) / 180

/**
 * The articulation table. The anchor is the child segment's head bone (the shared
 * point). Limits keep every joint inside a real human range of motion:
 *  - `revolute` hinges (elbow, knee) bend on one axis with a min/max stop;
 *  - `cone` ball joints (spine, neck, shoulder, hip) allow a limited swing around
 *    the bone plus a limited twist — an UNLIMITED ball joint lets the head/limbs
 *    spin a full 360°, which is what we're fixing here.
 * Ranges are symmetric approximations of anatomical ROM; the goal is plausible,
 * bounded motion, not clinical accuracy. The shoulder is the most mobile joint,
 * the spine the least.
 */
type JointRow = {
  readonly id: string
  readonly parent: string
  readonly child: string
  readonly anchor: string
  readonly kind: RagdollJointKind
  readonly limit?: readonly [number, number]
  readonly twist?: readonly [number, number]
  readonly swing?: readonly [number, number]
  readonly swingSide?: readonly [number, number]
  readonly contacts?: boolean
  readonly damping?: number
  readonly buckle?: number
  readonly relaxable?: boolean
}

// Knees and elbows carry a `buckle` target: at death the limbs FOLD instead of
// staying rigid. Straight limbs make the body drop like a plank and bounce off the
// floor; folding joints both read as a person collapsing and absorb the landing.
//
// SIGNS ARE MEASURED, NOT DERIVED. Rapier's hinge-angle sign depends on how it
// completes a basis from the axis we hand it, so it cannot be reasoned out from the
// bone geometry — a wrong sign puts the ALLOWED range on the side the joint doesn't
// want to move, and the hinge sits locked at its limit looking like a rigid stick
// (that was the knee: limit [-2.5, 0] held it at 0-2° through an entire collapse).
// Both hinges here happen to fold POSITIVE. If a rig ever bends the wrong way,
// re-measure: open the limits wide, log the signed angle about the hinge axis, and
// set `limit`/`buckle` to the side it actually travels.
//
// Ranges stay at anatomical ROM. A corpse reading as "wooden" is NOT fixed by widening
// these — widened stops just let the body reach poses a real one can't. Looseness comes
// from the bodies' angular damping (how hard a joint holds its current position), not
// from the size of the range.
const JOINTS: readonly JointRow[] = [
  // Sagittal ranges are ASYMMETRIC, as the real ones are: the trunk flexes ~75° but
  // extends only ~26°, and the hip flexes 110-120° against 10-15° of extension. That
  // ratio is why a body folds forward far more readily than back, and why a collapse
  // pitches forward — with symmetric cones it could jack-knife backwards just as
  // easily, which no body does. The lateral axis (`swingSide`) stays tight.
  //
  // NEGATIVE is forward here, and that was MEASURED, not read off a screenshot: the
  // first attempt had the sign the other way and the body landed on its back every
  // time while still looking plausible in stills. The test that settles it is the
  // torso's own facing at rest — the bodies spawn identity-rotated, so the torso's
  // local +Z is the model's forward, and the world Y of that vector says whether the
  // chest ended up pointing at the sky (fell backwards) or at the floor.
  { id: 'spine', parent: 'pelvis', child: 'torso', anchor: 'spine1', kind: 'cone', twist: [-deg(35), deg(35)], swing: [-deg(70), deg(26)], swingSide: [-deg(30), deg(30)] },
  // Neck twist is deliberately well under the 80° a live head can rotate: swing and
  // twist COMBINE, and 45+60 let the head reach ~105° of total deviation — enough to
  // fold chin-to-chest, which a limp neck cannot do. Verified the cone limits really
  // are enforced by clamping this row to 5° and measuring 7° of deviation.
  { id: 'neck', parent: 'torso', child: 'head', anchor: 'head', kind: 'cone', twist: [-deg(35), deg(35)], swing: [-deg(35), deg(35)], relaxable: true },
  { id: 'shoulderL', parent: 'torso', child: 'upperArmL', anchor: 'leftarm', kind: 'cone', twist: [-deg(45), deg(45)], swing: [-deg(75), deg(75)], swingSide: [-deg(60), deg(60)], contacts: true, damping: 3 },
  { id: 'elbowL', parent: 'upperArmL', child: 'lowerArmL', anchor: 'leftforearm', kind: 'revolute', limit: [0, 2.5], buckle: deg(70), relaxable: true },
  { id: 'shoulderR', parent: 'torso', child: 'upperArmR', anchor: 'rightarm', kind: 'cone', twist: [-deg(45), deg(45)], swing: [-deg(75), deg(75)], swingSide: [-deg(60), deg(60)], contacts: true, damping: 3 },
  { id: 'elbowR', parent: 'upperArmR', child: 'lowerArmR', anchor: 'rightforearm', kind: 'revolute', limit: [0, 2.5], buckle: deg(70), relaxable: true },
  { id: 'hipL', parent: 'pelvis', child: 'thighL', anchor: 'leftupleg', kind: 'cone', twist: [-deg(35), deg(35)], swing: [-deg(75), deg(15)], swingSide: [-deg(15), deg(15)], contacts: true },
  { id: 'kneeL', parent: 'thighL', child: 'shinL', anchor: 'leftleg', kind: 'revolute', limit: [-2.5, 0], buckle: -deg(85), relaxable: true },
  { id: 'hipR', parent: 'pelvis', child: 'thighR', anchor: 'rightupleg', kind: 'cone', twist: [-deg(35), deg(35)], swing: [-deg(75), deg(15)], swingSide: [-deg(15), deg(15)], contacts: true },
  { id: 'kneeR', parent: 'thighR', child: 'shinR', anchor: 'rightleg', kind: 'revolute', limit: [-2.5, 0], buckle: -deg(85), relaxable: true },
]

const UP = new Vector3(0, 1, 0)
const FORWARD = new Vector3(0, 0, 1)

export function normalizeBoneName(name: string): string {
  // Mixamo bones are `mixamorig:Hips`, but glTF conversion strips the colon to
  // `mixamorigHips`. Handle both: drop any namespace and the `mixamorig` prefix.
  let normalized = name.toLowerCase()
  const colon = normalized.lastIndexOf(':')
  if (colon >= 0) normalized = normalized.slice(colon + 1)
  if (normalized.startsWith('mixamorig')) normalized = normalized.slice('mixamorig'.length)
  return normalized.replace(/^[_:.\- ]+/, '')
}

/**
 * The rig, indexed by normalized name — and deliberately in TWO maps, because a
 * segment asks two different questions of the skeleton.
 *
 * A segment DRIVES a bone: that one has to be a real `Bone`, since the write-back
 * poses it. A segment is also MEASURED to a tail, and the tail is only ever read
 * for a length and a direction — it never has to be a bone at all.
 *
 * The distinction is not academic. Mixamo's leaf ends (`HeadTop_End`,
 * `LeftToe_End`) carry no skin weights, so an exporter leaves them out of the
 * glTF skin's joint list — and three creates a `Bone` ONLY for nodes named there
 * (`GLTFLoader._markDefs`); everything else becomes a plain `Object3D` holding
 * the exact same transform. Indexing bones alone therefore loses the top of the
 * head, and the head segment silently falls back to a guessed tail: its capsule
 * ended up 20 cm low, centred on the neck, leaving the skull with no collider at
 * all while the spec still reported a full set of segments.
 */
type RigIndex = {
  /** Real bones only — a body may only drive one of these. */
  readonly bones: Map<string, Bone>
  /** Every named node, bones included — used to measure tails. */
  readonly nodes: Map<string, Object3D>
}

function indexRig(root: Object3D): RigIndex {
  const bones = new Map<string, Bone>()
  const nodes = new Map<string, Object3D>()
  root.traverse((object) => {
    if (!object.name) return
    const name = normalizeBoneName(object.name)
    const bone = object as Bone
    // A bone always wins the node slot: a mesh or an attachment sharing a joint's
    // name would otherwise decide where that joint is.
    if (bone.isBone) {
      bones.set(name, bone)
      nodes.set(name, bone)
    } else if (!nodes.has(name)) {
      nodes.set(name, object)
    }
  })
  return { bones, nodes }
}

/**
 * Builds the ragdoll spec from a posed model. Reads current bone WORLD transforms,
 * so call after the model's matrices are up to date. Returns null if the core
 * bones (hips + a limb) are missing — i.e. the rig is not Mixamo-compatible.
 */
export function buildRagdollSpec(root: Object3D): RagdollSpec | null {
  root.updateWorldMatrix(true, true)
  const rig = indexRig(root)
  if (!rig.bones.has('hips') || !rig.bones.has('leftarm')) return null

  // Measured from the BIND pose, never from whatever pose the body is standing
  // in when this runs.
  //
  // Every hinge records how bent it already is where the bodies are built, and
  // every limit, buckle target and unfold target is written as an offset from
  // that. Correct — and useless if the number is different every time. Read from
  // the live pose it describes whichever animation frame happened to have landed
  // at mount: an enemy standing at ease records elbows at 0°, the player holding
  // a pistol records 15–17°, and the same authored range then sits fifteen
  // degrees off on him.
  //
  // The bind pose is the one pose every Mixamo rig agrees on — limbs straight,
  // the configuration the limits were authored against. The live pose is not
  // lost: waking applies `bone.matrixWorld · bind⁻¹`, a relative transform, so
  // the bodies still start exactly where the body is standing.
  const restore = poseToBind(root)
  try {
    return measureSpec(rig)
  } finally {
    restore()
  }
}

/**
 * Puts the skeleton in its bind pose for the duration of a measurement, and
 * returns the function that undoes it. Every bone is saved and restored, not
 * only the ones the ragdoll drives: `skeleton.pose()` resets all of them, and
 * restoring a subset leaves fingers, toes, neck and the spine's intermediate
 * links in the bind pose for the body's whole life.
 */
function poseToBind(root: Object3D): () => void {
  let skeleton: Skeleton | null = null
  root.traverse((object) => {
    const skinned = object as SkinnedMesh
    if (skeleton === null && skinned.isSkinnedMesh && skinned.skeleton) skeleton = skinned.skeleton
  })
  if (skeleton === null) return () => {}

  const held = (skeleton as Skeleton).bones.map((bone) => ({
    bone,
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  }))
  ;(skeleton as Skeleton).pose()
  root.updateWorldMatrix(true, true)

  return () => {
    for (const entry of held) {
      entry.bone.position.copy(entry.position)
      entry.bone.quaternion.copy(entry.quaternion)
      entry.bone.scale.copy(entry.scale)
    }
    root.updateWorldMatrix(true, true)
  }
}

function measureSpec({ bones, nodes }: RigIndex): RagdollSpec | null {

  // Tails and joint anchors are POSITIONS, so they are read from the node index:
  // a Mixamo leaf end is not a bone in glTF, and looking it up among bones alone
  // is what put the head's capsule on the neck.
  const worldOf = (name: string): Vector3 | null => {
    const node = nodes.get(name)
    return node ? node.getWorldPosition(new Vector3()) : null
  }

  const segments: RagdollSegment[] = []
  const segmentById = new Map<string, RagdollSegment>()
  for (const [id, headName, tailName, radiusFactor, massFraction, angularDamping] of SEGMENTS) {
    const bone = bones.get(headName)
    const head = worldOf(headName)
    if (!bone || !head) continue
    // Last resort when the rig genuinely has no tail node: a short offset below
    // the head, so the segment still has a length. It is a GUESS, and a guess
    // that silently mis-places a capsule is exactly how the head lost its
    // collider for weeks — so it says so out loud in DEV.
    const tailAt = worldOf(tailName)
    if (!tailAt && import.meta.env.DEV) {
      console.error(
        `Ragdoll: segment "${id}" has no tail node "${tailName}" in this rig — ` +
        'its capsule is being guessed and will not match the mesh.',
      )
    }
    const tail = tailAt ?? head.clone().add(new Vector3(0, -0.2, 0))
    const direction = tail.clone().sub(head)
    const length = Math.max(direction.length(), 0.05)
    direction.normalize()
    // The generic fit: the capsule IS the bone — centred on its midpoint, half as
    // long as it, radius a factor of it. `CAPSULE_FIT` overrides all three where
    // the bone is not the shape (the head).
    const fit = CAPSULE_FIT[id]
    const radius = Math.max(0.03, (fit?.radius ?? radiusFactor) * length)
    const halfLength = (fit?.halfLength ?? 0.5) * length
    // A fitted centre is given in the BONE's frame, because that is the frame the
    // mesh was measured in — so it is rotated by the bone, not added to the world.
    const center = fit
      ? head.clone().add(new Vector3(...fit.centre).multiplyScalar(length).applyQuaternion(bone.getWorldQuaternion(new Quaternion())))
      : head.clone().addScaledVector(direction, 0.5 * length)
    // The body spawns AT `center` with no rotation of its own (the collider
    // carries the orientation), so its frame is a pure translation.
    const bind = new Matrix4().makeTranslation(center.x, center.y, center.z).invert().multiply(bone.matrixWorld)
    const segment: RagdollSegment = {
      id,
      bind,
      bone,
      center,
      orientation: new Quaternion().setFromUnitVectors(UP, direction),
      halfHeight: Math.max(0.01, halfLength - radius),
      radius,
      massFraction,
      angularDamping,
    }
    segments.push(segment)
    segmentById.set(id, segment)
  }

  const joints: RagdollJoint[] = []
  for (const { id, parent, child, anchor: anchorName, kind, limit, twist, swing, swingSide, contacts, damping, buckle, relaxable } of JOINTS) {
    if (!segmentById.has(parent) || !segmentById.has(child)) continue
    const anchor = worldOf(anchorName)
    if (!anchor) continue
    const childDirection = directionOf(segmentById.get(child)!)
    const axis = kind === 'revolute' ? bendAxis(childDirection) : childDirection
    joints.push({
      id,
      parent,
      child,
      anchor,
      kind,
      axis,
      // How bent this hinge already is where the bodies are being built. Rapier
      // measures a joint from the configuration it was created in, so on a start
      // pose with a bent knee its zero IS that bend — and a range written for an
      // anatomically straight leg then sits in the wrong place, letting the knee
      // travel backwards out of it. Everything angular is offset by this instead.
      rest: kind === 'revolute' ? signedBend(directionOf(segmentById.get(parent)!), childDirection, axis) : 0,
      // Revolute: a hinge axis perpendicular to the child limb so an elbow/knee
      // BENDS not twists (for a horizontal arm the fore/back axis; a vertical leg
      // degenerates the UP cross, so fall back to the side axis). Cone: the bone
      // direction itself is the twist axis, and swing is limited around it.
      limit,
      twist,
      swing,
      swingSide,
      contacts,
      damping,
      buckle,
      relaxable,
    })
  }

  return { segments, joints }
}

function directionOf(segment: RagdollSegment): Vector3 {
  return UP.clone().applyQuaternion(segment.orientation)
}

/** Signed angle from the parent bone to the child about the hinge axis. */
function signedBend(parentDirection: Vector3, childDirection: Vector3, axis: Vector3): number {
  const cross = new Vector3().crossVectors(parentDirection, childDirection)
  return Math.atan2(cross.dot(axis), parentDirection.dot(childDirection))
}

/**
 * The axis a knee or elbow bends about, taken against the body's FORWARD.
 *
 * It used to be taken against UP, which quietly broke on any posed leg: for a limb
 * near vertical that cross product nearly vanishes, so its direction is decided by
 * whichever way the limb happens to lean. In the walking pose the two shins lean
 * opposite ways, the two knees ended up with axes pointing opposite ways, and the
 * SAME anatomical bend then measured +11° on one leg and -21° on the other — one
 * knee's allowed range landed on its hyperextension side and it folded backwards.
 *
 * Against forward the axis is the medio-lateral one for a leg and the vertical one
 * for a T-posed arm, which is right in both cases, and it does not move when the
 * limb is posed. UP is kept only for a limb pointing along forward itself.
 */
function bendAxis(limbDirection: Vector3): Vector3 {
  const axis = new Vector3().crossVectors(limbDirection, FORWARD)
  if (axis.lengthSq() < 1e-4) axis.crossVectors(limbDirection, UP)
  return axis.normalize()
}
