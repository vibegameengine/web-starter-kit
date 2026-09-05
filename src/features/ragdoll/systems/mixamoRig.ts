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
  /**
   * Rapier collision groups for every capsule of this body, or undefined to leave
   * the engine's default (collide with everything).
   *
   * Set only when the body asked for `selfCollision: 'off'`, because turning a
   * pair of contacts off at the JOINTS is not enough on its own: a wide trunk
   * also intersects limbs it is not jointed to, and nothing was filtering those.
   */
  readonly collisionGroups?: number
}

/**
 * The membership bit every self-ignoring ragdoll shares, and the filter that
 * excludes it.
 *
 * One bit rather than one per body: with sixteen available and corpses coming and
 * going, per-instance bits run out and have to be recycled. The cost of sharing
 * is that two such bodies also pass through EACH OTHER — two corpses in a heap
 * rather than a pile. Each still collides with the world, which is the part that
 * decides whether a body lies on the floor or falls through it.
 */
const RAGDOLL_SELF_GROUP = (0x8000 << 16) | 0x7fff

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
  // FEET were added here and reverted. They are worth someone's time later, so
  // the measurement is kept rather than the code: with `['footL','leftfoot',
  // 'lefttoebase',0.30,0.0145,d]` and revolute ankles at [-45deg, +30deg] the
  // imp's corpse span went 0.559 -> 1.047 of body height, straight through a
  // floor it had never once reached — the feet ARE the extremity a short-limbed
  // body is missing, and the mannequin control barely moved (0.728 -> 0.722),
  // which says this was more body being simulated rather than a wider ruler.
  // But rest time went 3.55s +/- 0.94 to 6.67s +/- 1.46, and BOTH bodies then
  // failed to settle inside four seconds. Damping the feet like the forearms
  // (d = 1.2) did not help: 6.99s, worse. Two light bodies at the end of the
  // chain keep the rest detector awake, and that needs solving before feet can
  // come back.
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
  // A contact pair on the NECK was tried here and reverted, so it is not tried a
  // third time: the head does sink toward the chest without one, but switching it
  // on cost the mannequin both its span (0.728 -> 0.644) and its rest (settled
  // true -> false) while moving the imp 0.612 -> 0.606, which is nothing. The
  // file's own note above says why — a trunk capsule wide enough to swallow its
  // own joint anchor is one the solver spends the whole corpse pushing out of.
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
  /**
   * The body's own mesh, when it has one. It is what says how THICK a limb is:
   * a bone carries a length and a direction and nothing else, so a capsule sized
   * off it is sized off a proportion someone guessed for a different body.
   */
  readonly skinned: SkinnedMesh | null
}

function indexRig(root: Object3D): RigIndex {
  const bones = new Map<string, Bone>()
  const nodes = new Map<string, Object3D>()
  let skinned: SkinnedMesh | null = null
  root.traverse((object) => {
    const mesh = object as SkinnedMesh
    if (skinned === null && mesh.isSkinnedMesh && mesh.skeleton) skinned = mesh
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
  return { bones, nodes, skinned }
}

/**
 * Every vertex the body owns, sorted into the bone that carries most of it and
 * expressed in THAT bone's own frame.
 *
 * This is the measurement the capsules were missing. A radius written as a
 * fraction of bone length is a guess about proportion, and it is the same guess
 * for every body that ever uses this rig: the numbers in `SEGMENTS` were fitted
 * to a full-height Mixamo mannequin, whose thighs are short and thick relative to
 * the bone. Put a metre-tall imp with long thin legs on the same fractions and it
 * collapses inside capsules half again too wide for it — which is exactly what it
 * did, in front of the person who asked for it.
 *
 * Bone-local, because that is the one frame in which "how far is this vertex from
 * the bone" is a question with an answer. The skin's own inverse bind matrix is
 * the change of basis, and it is also what makes this immune to whatever space
 * the vertex positions happen to be stored in — an asset built with `?meshopt`
 * has its positions rescaled and re-centred, and the matching inverse bind takes
 * that straight back out.
 */
/**
 * Cached per ASSET, keyed by geometry, and the cache is what makes it affordable.
 *
 * This walks every vertex of a twenty-thousand-vertex body and allocates a
 * `Vector3` for each one. It ran once per MOUNT — six to twelve times in the
 * frame a wave spawns — and the result is identical every time: `cloneSkinned`
 * shares the geometry and copies `bindMatrix` and `boneInverses`, and the points
 * are computed in bone-LOCAL bind space, so nothing about a particular clone can
 * change them. Keyed on the geometry rather than the mesh for exactly that
 * reason, and stored by bone NAME so a fresh skeleton's own `Bone` objects can be
 * looked up against it.
 *
 * It is NOT keyed on the scene's applied scale, and does not need to be: the
 * scale `Mob` writes lands on the scene root, while `bindMatrix` and
 * `boneInverses` come off the asset. The distinction matters here more than most
 * places — a spec measured in the wrong space is the `?meshopt` bind-pose
 * disaster in AGENTS.md rule 5 — so if this ever starts being keyed on anything,
 * key it on the values it actually reads.
 */
const vertexClouds = new Map<string, Map<string, Vector3[]>>()

function vertexCloud(skinned: SkinnedMesh): Map<Bone, Vector3[]> {
  const { bones } = skinned.skeleton
  const cached = vertexClouds.get(skinned.geometry.uuid)
  if (cached) {
    const rebuilt = new Map<Bone, Vector3[]>()
    for (const bone of bones) {
      const points = cached.get(bone.name)
      if (points) rebuilt.set(bone, points)
    }
    return rebuilt
  }

  const cloud = new Map<Bone, Vector3[]>()
  const byName = new Map<string, Vector3[]>()
  const geometry = skinned.geometry
  const position = geometry.getAttribute('position')
  const skinIndex = geometry.getAttribute('skinIndex')
  const skinWeight = geometry.getAttribute('skinWeight')
  if (!position || !skinIndex || !skinWeight) return cloud

  const { boneInverses } = skinned.skeleton
  const point = new Vector3()
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    // The DOMINANT bone only. A vertex shared between a thigh and a shin belongs
    // to whichever actually carries it; splitting it between both would let every
    // joint's bulge inflate the capsule on each side of it.
    let bestSlot = 0
    let bestWeight = -1
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = skinWeight.getComponent(vertex, slot)
      if (weight > bestWeight) {
        bestWeight = weight
        bestSlot = slot
      }
    }
    if (bestWeight <= 0) continue
    // The skin index IS the bone's index in the skeleton. It used to look the
    // bone back up with `bones.indexOf(bone)` — a linear scan over 47 bones, run
    // once per vertex, inside the vertex loop.
    const boneIndex = skinIndex.getComponent(vertex, bestSlot)
    const bone = bones[boneIndex]
    if (!bone) continue

    point.fromBufferAttribute(position, vertex).applyMatrix4(skinned.bindMatrix)
    point.applyMatrix4(boneInverses[boneIndex])
    const existing = cloud.get(bone)
    if (existing) { existing.push(point.clone()) }
    else {
      const started = [point.clone()]
      cloud.set(bone, started)
      byName.set(bone.name, started)
    }
  }
  vertexClouds.set(geometry.uuid, byName)
  return cloud
}

/**
 * How many directions around the bone the surface is sampled in.
 *
 * Sixteen is enough to see a limb as round and few enough that every sector has
 * vertices in it on a mesh of this density.
 */
const RADIUS_SECTORS = 16
/** Fraction of those directions the capsule is asked to contain. */
const RADIUS_PERCENTILE = 0.8
/** How far in from each end the measurement is taken. */
const RADIUS_BAND = { high: 0.85, low: 0.15 }
/** Below this many vertices on a bone the reading is noise whatever its shape. */
const RADIUS_MIN_SAMPLES = 24
/** Below this many filled sectors the reading is a sliver of mesh, not a cross-section. */
const RADIUS_MIN_SECTORS = 8

/**
 * How thick this limb actually is, from the mesh, or null when the mesh cannot
 * answer.
 *
 * The statistic is the NEAREST surface in each direction around the bone, and
 * that choice is the whole of it. The obvious measurement — a high percentile of
 * every vertex's distance from the axis — was tried and measures the wrong thing
 * on any character wearing anything: a garment hangs OUTSIDE the body and is
 * weighted to the bone underneath it, so it lands in the upper half of the
 * distribution and drags the percentile with it. Measured on the imp, whose
 * loincloth is weighted to the hips and thighs, that gave a thigh of 0.162 m on a
 * 0.411 m bone and a pelvis of 0.137 m on a 0.070 m one — a body built out of
 * spheres as wide as itself, which is exactly what a corpse flattened into a
 * pancake looks like from the outside.
 *
 * Flesh is present in EVERY direction around a limb; cloth only adds far points
 * in some of them and can never remove the near ones. So the nearest vertex per
 * angular sector is the body's own surface whatever is draped over it, and the
 * percentile is then taken across directions rather than across vertices. Same
 * imp: thigh 0.055, shin 0.042, pelvis 0.095.
 *
 * Measured across the MIDDLE of the bone and never at its ends — a shoulder, a
 * knee and a hand are all bulges sitting on the ends of bones, and a radius that
 * contained them would describe the joint rather than the limb.
 */
function measuredRadius(cloud: Map<Bone, Vector3[]>, bone: Bone, tailLocal: Vector3): number | null {
  const points = cloud.get(bone)
  const axisLength = tailLocal.length()
  if (!points || points.length < RADIUS_MIN_SAMPLES || axisLength < 1e-4) return null

  const axis = tailLocal.clone().divideScalar(axisLength)
  // Any two directions across the bone, to measure an angle around it.
  const across = new Vector3()
    .crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : new Vector3(1, 0, 0))
    .normalize()
  const alsoAcross = new Vector3().crossVectors(axis, across).normalize()

  const nearest = new Array<number>(RADIUS_SECTORS).fill(Infinity)
  const offset = new Vector3()
  for (const point of points) {
    const projection = point.dot(axis)
    const t = projection / axisLength
    if (t < RADIUS_BAND.low || t > RADIUS_BAND.high) continue
    offset.copy(point).addScaledVector(axis, -projection)
    const radius = offset.length()
    const angle = Math.atan2(offset.dot(alsoAcross), offset.dot(across))
    const sector = Math.min(RADIUS_SECTORS - 1, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * RADIUS_SECTORS))
    if (radius < nearest[sector]) nearest[sector] = radius
  }

  const filled = nearest.filter((radius) => Number.isFinite(radius)).sort((left, right) => left - right)
  if (filled.length < RADIUS_MIN_SECTORS) return null
  return filled[Math.min(filled.length - 1, Math.floor(filled.length * RADIUS_PERCENTILE))]
}


/**
 * Builds the ragdoll spec from a posed model. Reads current bone WORLD transforms,
 * so call after the model's matrices are up to date. Returns null if the core
 * bones (hips + a limb) are missing — i.e. the rig is not Mixamo-compatible.
 */
/**
 * Per-BODY choices about how its capsules are found.
 *
 * They are options rather than behaviour because two bodies in this project
 * genuinely need different answers, and neither answer is wrong. The authored
 * fractions in `SEGMENTS` were fitted to a full-height humanoid and are
 * deliberately slim at the trunk — `hipL/hipR` and the shoulders keep their
 * contacts on so a limb cannot pass through the torso, and a trunk wide enough to
 * swallow its own joint anchor is one the solver must push its own legs out of.
 * That slimness is load-bearing for that body: measured, widening it stops the
 * mannequin settling at all, at four, six and ten seconds.
 *
 * It is also wrong for a body shaped differently. The imp is hunched and its
 * trunk bones are short, so the same fractions degenerate its pelvis to the 3 cm
 * floor and make its torso half the thickness of its own thigh — a stick that
 * never comes to rest and lands folded into itself.
 */
export type RagdollFitOptions = {
  /**
   * Take each capsule's thickness from the MESH instead of from the authored
   * fraction of bone length. See `measuredRadius` for how, and why the obvious
   * statistic measures a garment rather than a body.
   *
   * Off by default, and the default is the point: this changes the shape of every
   * capsule on a body, and a body that already settles reliably has nothing to
   * gain and a working configuration to lose.
   */
  readonly capsulesFromMesh?: boolean
  /**
   * Whether the segments of THIS body collide with each other.
   *
   * `trunk` (the default, and what every body did before this was an option):
   * the four joints that exist to keep a limb out of the torso — the two hips and
   * the two shoulders — keep their contacts, and every other jointed pair already
   * has them off. It is what makes a corpse's arm lie ON its chest rather than
   * inside it.
   *
   * `off`: nothing in this body touches itself, only the world.
   */
  readonly selfCollision?: 'off' | 'trunk'
  /**
   * Multiplies every segment's angular damping — how hard a limb resists being
   * turned, which is what decides whether a corpse creeps or comes to rest.
   *
   * It travels with `capsulesFromMesh` in practice, and for a physical reason: a
   * capsule fitted to a thin limb has less contact and less drag than the fat
   * authored one it replaces, so the same body takes longer to stop. Measured on
   * the imp, whose thighs went from 0.132 to 0.055 — it settled inside four
   * seconds in one run out of three. The authored damping was fitted to the fat
   * capsules; the thin ones need their own.
   */
  readonly angularDamping?: number
  /**
   * Scales the knee/elbow BUCKLE — the fold that is driven into the limbs for the
   * first moment after death so the body gives way instead of toppling like a
   * plank. 0 disables it.
   *
   * A per-body number because the reflex drives BOTH knees to the same angle, and
   * what that produces depends on what the legs were doing. Measured on the imp:
   * killed standing it comes to rest in four runs out of four, killed mid-stride
   * in two — the asymmetric pose plus a symmetric fold puts it on one knee, where
   * it keeps micro-moving. In this game that is the common case, because an imp
   * is killed running at you.
   */
  readonly buckle?: number
  /**
   * Extra hip EXTENSION, in radians — how far the thigh may swing back past the
   * authored stop.
   *
   * The authored range is a human's: `[-75°, +15°]`, because a live person flexes
   * the hip far more than they extend it. A corpse dropped by a symmetric buckle
   * then ends with its knees tucked under its pelvis and stays that way, because
   * fifteen degrees is all the room it has to open out again. Whether that is
   * right depends on the creature: this one is digitigrade and already stands
   * with its hips open.
   *
   * MEASURED AND NOT USED. It was prescribed as the fix for a corpse that lands
   * with its knees under it, and it makes that corpse worse: at 0.9 rad of extra
   * extension the imp came to rest in one run out of four, against six out of six
   * without it, and the spread of how it lands grew from 0.11 to 0.17 m. More
   * freedom in the hip is more room to keep moving. Kept as an option because the
   * next creature may need it; left at zero because this one does not.
   */
  readonly hipExtension?: number
}

export function buildRagdollSpec(root: Object3D, options: RagdollFitOptions = {}): RagdollSpec | null {
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
    return measureSpec(rig, options)
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

  /**
   * A bind pose is a POSE, not a resize — so the skeleton is measured at the size
   * the body actually lives at, whatever size its bind matrices are expressed in.
   *
   * `Skeleton.pose()` rebuilds every bone from `boneInverses`, and those matrices
   * do not have to be in the same space as the live rig. A model built with
   * `?meshopt` is exactly that case: the optimizer's quantization step rescales
   * and re-centres the vertex positions and compensates by changing the inverse
   * bind matrices, so the drawn body is identical while the recovered bind pose
   * comes back at a different scale entirely. Measured on the imp: an inverse-bind
   * scale of 0.4998 against the source asset's 1.0000, so `pose()` handed back a
   * skeleton at TWICE size. Every capsule was then measured twice as thick, and
   * every `bind` below carried that factor into `syncToSkeleton`, which decomposes
   * it straight onto `bone.scale` — the body visibly doubled the instant it died.
   *
   * Only the scale has to come out. The bind pose's absolute POSITION never
   * escapes this function: `bind` is a transform relative to the body's own
   * centre and waking applies `bone.matrixWorld · bind⁻¹`, so a bind pose that
   * sits a metre from where the body stands cancels itself out. A scale does not.
   *
   * Only bones with no bone parent are touched, and that is the whole of it:
   * `pose()` derives every other bone's local from its parent's world, which has
   * already absorbed the factor, so the rest come back unit-scaled on their own.
   */
  for (const entry of held) {
    if ((entry.bone.parent as Bone | null)?.isBone) continue
    if (entry.bone.scale.equals(entry.scale)) continue
    const { x, y, z } = entry.bone.scale
    if (import.meta.env.DEV && (Math.abs(x - y) > 1e-3 || Math.abs(x - z) > 1e-3)) {
      console.error(
        `Ragdoll: the bind pose of "${entry.bone.name}" is a NON-uniform resize of the live rig ` +
        `(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) — its capsules cannot be measured from it.`,
      )
    }
    entry.bone.scale.copy(entry.scale)
  }

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


/**
 * How long a MISSING tail node is, as a multiple of the link that arrived at the
 * bone it belongs to. Measured on this project's own reference rig
 * (`ragdoll/assets/models/default-humanoid.fbx`), not estimated: on it the skull
 * — `Head` to `HeadTop_End` — is 0.1963 m against a `Neck`-to-`Head` link of
 * 0.1079 m. Anything not listed continues its link at its own length.
 */
const GUESSED_TAIL_FACTOR: Readonly<Record<string, number>> = { head: 1.82 }

/**
 * Where a segment's tail is when the rig simply has no node for it.
 *
 * Mixamo's leaf ends (`HeadTop_End`, the finger tips) are export-time extras, and
 * a character rigged elsewhere to Mixamo bone NAMES — a generated mesh, say —
 * routinely has none of them. The head is the segment that notices: its bone runs
 * from the base of the skull to the crown, and with no crown node its capsule has
 * nothing to span.
 *
 * So the guess CONTINUES the link that arrived at the bone: same direction, and a
 * length that is a measured proportion of it. That makes it a proportion of the
 * rig rather than a number — it used to be `head + (0, -0.2, 0)`, a fifth of a
 * metre straight DOWN in world space regardless of which way the bone pointed or
 * how big the body was.
 *
 * It is still a guess, and the DEV error at the call site still says so.
 */
function guessTail(bone: Bone, head: Vector3, id: string): Vector3 {
  const parent = bone.parent
  const link = parent
    ? head.clone().sub(parent.getWorldPosition(new Vector3()))
    // No parent at all: nothing to continue, so fall back to the bone's own up.
    : new Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new Quaternion())).multiplyScalar(0.1)
  const length = Math.max(link.length(), 0.02) * (GUESSED_TAIL_FACTOR[id] ?? 1)
  return head.clone().addScaledVector(link.normalize(), length)
}

const scratchBoneInverse = new Matrix4()

/** DEV: what the mesh said versus what the table said, per segment. */
const measuredLog: string[] = []

function measureSpec({ bones, nodes, skinned }: RigIndex, options: RagdollFitOptions): RagdollSpec | null {
  // One pass over the mesh, at build time, shared by every segment below.
  // Walked when the body ASKED for mesh-fitted capsules, and additionally in DEV
  // so the comparison can be read off `__ragdollRadii` on any body. A full pass
  // over twenty thousand vertices is not something a shipped build pays for
  // unless it is using the answer.
  /*
   * Walked when the body ASKED for mesh-fitted capsules — and no longer "also in
   * DEV".
   *
   * The DEV arm meant every mob paid a full vertex walk on mount whether or not
   * anything read the answer, and the build being profiled is the DEV build, so
   * the frame-cost work was measuring a cost the shipped game does not have. The
   * comparison it fed is still reachable: ask for it explicitly with
   * `capsulesFromMesh`, or read `__ragdollRadii` on a body that does.
   */
  const wantsMesh = options.capsulesFromMesh === true
  const cloud = skinned && wantsMesh ? vertexCloud(skinned) : new Map<Bone, Vector3[]>()
  if (import.meta.env.DEV) {
    measuredLog.length = 0
    ;(globalThis as Record<string, unknown>).__ragdollRadii = measuredLog
    measuredLog.push(`mesh=${skinned ? 'yes' : 'NO MESH'} bonesWithVertices=${cloud.size}`)
  }

  // Tails and joint anchors are POSITIONS, so they are read from the node index:
  // a Mixamo leaf end is not a bone in glTF, and looking it up among bones alone
  // is what put the head's capsule on the neck.
  const worldOf = (name: string): Vector3 | null => {
    const node = nodes.get(name)
    return node ? node.getWorldPosition(new Vector3()) : null
  }

  /**
   * Where each segment's own limbs are attached, for the joints that keep their
   * contacts. Those four — the two hips and the two shoulders — exist so a limb
   * cannot pass through the trunk, which means the trunk's capsule must not
   * swallow the anchor its limb hangs from: a parent and child overlapping AT
   * their joint is a pair the solver pushes apart for the rest of the corpse's
   * life, and it never comes to rest.
   */
  const contactAnchors = new Map<string, Vector3[]>()
  for (const joint of JOINTS) {
    if (joint.contacts !== true || options.selfCollision === 'off') continue
    const anchor = worldOf(joint.anchor)
    if (!anchor) continue
    const existing = contactAnchors.get(joint.parent)
    if (existing) existing.push(anchor)
    else contactAnchors.set(joint.parent, [anchor])
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
    const tail = tailAt ?? guessTail(bone, head, id)
    const direction = tail.clone().sub(head)
    const length = Math.max(direction.length(), 0.05)
    direction.normalize()
    // The generic fit: the capsule IS the bone — centred on its midpoint, half as
    // long as it, radius a factor of it. `CAPSULE_FIT` overrides all three where
    // the bone is not the shape (the head).
    const fit = CAPSULE_FIT[id]
    // Thickness comes from the MESH where the mesh can answer, and from the
    // authored fraction only where it cannot. The two disagree by a lot on any
    // body that is not shaped like the mannequin the fractions were fitted to.
    const tailLocal = tail.clone().applyMatrix4(scratchBoneInverse.copy(bone.matrixWorld).invert())
    const authored = (fit?.radius ?? radiusFactor) * length
    const fromMesh = wantsMesh || import.meta.env.DEV ? measuredRadius(cloud, bone, tailLocal) : null
    // NOTE, and it used to say the opposite: the measurement does NOT only
    // shrink. There is no `Math.min` below, and on this rig the mesh INFLATES —
    // measured live, the imp's pelvis goes 0.029 -> 0.137 and its thigh
    // 0.132 -> 0.162, and the mannequin's pelvis would go 0.042 -> 0.162 if it
    // asked. A shrink-only cap was tried and reverted (`wip/imp-anim/VERDICTS.md`
    // row 3); the comment describing it outlived the code by several hours, which
    // is exactly how a reader ends up trusting a guarantee nothing provides.
    /**
     * Which answer this body asked for. The authored fraction is the default and
     * stays the default — see `RagdollFitOptions` for why one of them is not
     * simply better than the other.
     */
    /**
     * And never wider than the joint it carries. Measured on the imp when its
     * capsules were still sized off a percentile that had counted its loincloth:
     * pelvis 0.137 plus thigh 0.162 against a hip anchor 0.094 from the pelvis
     * axis — an overlap of three to one, and a body that never settled. That
     * arithmetic was once used to argue the clamp could not work; it was arguing
     * about numbers the measurement no longer produces (thigh 0.055 now), which
     * is exactly why a conclusion reached by reasoning has to be re-derived when
     * its inputs move.
     */
    const anchors = contactAnchors.get(id)
    let allowed = Infinity
    for (const anchor of anchors ?? []) {
      const along = anchor.clone().sub(head)
      const projection = along.dot(direction)
      allowed = Math.min(allowed, along.addScaledVector(direction, -projection).length())
    }
    const radius = Math.max(0.02, Math.min(allowed, (wantsMesh ? fromMesh : null) ?? authored))
    if (import.meta.env.DEV) measuredLog.push(`${id} authored=${authored.toFixed(3)} mesh=${fromMesh === null ? 'null' : fromMesh.toFixed(3)}`)
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
      angularDamping: angularDamping * (options.angularDamping ?? 1),
    }
    segments.push(segment)
    segmentById.set(id, segment)
  }

  const joints: RagdollJoint[] = []
  for (const { id, parent, child, anchor: anchorName, kind, limit, twist, swing: authoredSwing, swingSide, contacts, damping, buckle, relaxable } of JOINTS) {
    // The hips take the body's own extension range: see `hipExtension`.
    const swing = authoredSwing && options.hipExtension && (id === 'hipL' || id === 'hipR')
      ? ([authoredSwing[0], authoredSwing[1] + options.hipExtension] as const)
      : authoredSwing
    if (!segmentById.has(parent) || !segmentById.has(child)) continue
    const anchor = worldOf(anchorName)
    if (!anchor) continue
    const childDirection = directionOf(segmentById.get(child)!)
    const axis = kind === 'revolute' ? bendAxis(childDirection) : childDirection
    if (import.meta.env.DEV && kind === 'revolute') {
      const rest = signedBend(directionOf(segmentById.get(parent)!), childDirection, axis)
      // The angle every limit on this hinge is written as an offset FROM. On a rig
      // whose bind pose has straight limbs it is near zero; on one bound in a
      // crouch it is not, and the whole authored range shifts with it — which is
      // what a knee bending the wrong way looks like from the outside.
      measuredLog.push(`joint ${id} rest=${(rest * 180 / Math.PI).toFixed(1)}deg axis=${axis.toArray().map((v) => v.toFixed(2)).join(',')}`)
    }
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
      contacts: options.selfCollision === 'off' ? false : contacts,
      damping,
      // A scale of 0 means NO reflex, and it has to come out as `undefined`.
      // Left as the number 0 it passes the `!== undefined` guard downstream and
      // arms a position motor at target zero — which is not "no fold" but "hold
      // this joint straight, stiffly", the opposite. Measured before the fix: a
      // shin tore away from the body in half the deaths.
      buckle: buckle === undefined || options.buckle === 0 ? undefined : buckle * (options.buckle ?? 1),
      relaxable,
    })
  }

  return {
    collisionGroups: options.selfCollision === 'off' ? RAGDOLL_SELF_GROUP : undefined,
    joints,
    segments,
  }
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
