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
   * Bone pose in the BODY's frame (`body⁻¹ · bone`), taken at build time — the
   * one instant the two are guaranteed to describe. Sampled on the first frame
   * instead, it bakes in whatever ancestors the host has, and the corpse is then
   * simulated somewhere the mesh is not.
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
   * Rapier collision groups for this body's capsules, set only when it asked for
   * `selfCollision: 'off'`: turning contacts off at the JOINTS is not enough,
   * since a wide trunk also intersects limbs it is not jointed to.
   */
  readonly collisionGroups?: number
}

/**
 * One shared membership bit rather than one per body: sixteen exist and corpses
 * coming and going would recycle them. The cost is that two self-ignoring bodies
 * also pass through each other; each still collides with the world, which is what
 * decides whether a body lies on the floor or falls through it.
 */
const RAGDOLL_SELF_GROUP = (0x8000 << 16) | 0x7fff

// [id, head, tail, radiusFactor, massFraction, angularDamping]. radius =
// radiusFactor × bone length, which keeps the rig scale-independent.
// Mass fractions: Winter's body-segment parameters (Dempster cadaver data) — a
// uniform density makes a thin torso weigh less than a stubby limb. They sum to 1.
// Arms damp hardest: the lightest links on the longest levers flail under one
// damping for the whole body.
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
  // FEET were tried here and reverted; the measurement is kept rather than the
  // code. With `['footL','leftfoot','lefttoebase',0.30,0.0145,d]` and revolute
  // ankles at [-45°, +30°] the corpse span went 0.559 -> 1.047
  // of body height while the control barely moved (0.728 -> 0.722), so it was more
  // body being simulated rather than a wider ruler. But rest time went 3.55s ±0.94
  // to 6.67s ±1.46 and both bodies stopped settling inside four seconds; damping
  // them like the forearms (1.2) made it 6.99s. The rest detector needs solving
  // before feet can come back.
]

/**
 * Segments whose capsule is NOT the plain bone fit, because the bone is not the
 * shape. An upper arm IS its bone; the head is not. Measured on the mannequin's
 * own mesh: the skull is 0.160 wide × 0.259 tall × 0.248 deep, centred 0.075 above
 * a bone only 0.196 long, with the jaw 0.055 BELOW it.
 *
 * No radius factor expresses that — the generic fit clamps half-height and
 * degenerates to a Ø0.274 sphere. Kept as factors of bone length so the rig stays
 * scale-independent.
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
  // The measurement divided by the 0.196 bone: centre (0, 0.0746, 0.0103),
  // half-span 0.163, half-depth 0.124 — a 0.248 × 0.327 capsule, jaw to crown.
  // Nearly spherical because this skull is (0.160 × 0.259 × 0.248); what was wrong
  // before was not the shape but that nothing chose it.
  head: { centre: [0, 0.38, 0.052], halfLength: 0.83, radius: 0.63 },
}

const deg = (degrees: number): number => (degrees * Math.PI) / 180

/**
 * The articulation table; the anchor is the child segment's head bone. `revolute`
 * hinges (elbow, knee) stop on one axis; `cone` ball joints (spine, neck,
 * shoulder, hip) limit swing plus twist — unlimited, they spin a full 360°.
 * Ranges are symmetric approximations of anatomical ROM.
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
// dropping like a plank, which also absorbs the landing.
//
// SIGNS ARE MEASURED, NOT DERIVED. Rapier completes its basis from the axis it is
// handed, so a wrong sign puts the allowed range on the side the joint will not
// travel — that was the knee, held at 0-2° through an entire collapse by a limit
// of [-2.5, 0]. Both hinges here fold POSITIVE; re-measure by opening the limits
// and logging the signed angle about the axis.
//
// Widening these does not fix a corpse that reads as wooden. That is damping.
const JOINTS: readonly JointRow[] = [
  // Sagittal ranges are ASYMMETRIC, as the real ones are: the trunk flexes ~75°
  // and extends ~26°, the hip 110-120° against 10-15°. NEGATIVE is forward, and
  // that was measured — with the sign the other way the body landed on its back
  // every time while still looking plausible in stills. The test that settles it
  // is the torso's own facing at rest, not a screenshot.
  { id: 'spine', parent: 'pelvis', child: 'torso', anchor: 'spine1', kind: 'cone', twist: [-deg(35), deg(35)], swing: [-deg(70), deg(26)], swingSide: [-deg(30), deg(30)] },
  // Neck twist stays well under the 80° a live head reaches: swing and twist
  // COMBINE, and 45+60 already give ~105° of deviation. Verified the cone limit is
  // enforced by clamping this row to 5° and measuring 7°.
  // A neck contact pair was tried and reverted: mannequin span 0.728 -> 0.644 and
  // rest true -> false, against 0.612 -> 0.606 on the other body.
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
 * Two maps on purpose: a segment DRIVES a bone (which must be a real `Bone`,
 * since the write-back poses it) and is MEASURED to a tail (only ever read for a
 * length and a direction).
 *
 * Mixamo's leaf ends carry no skin weights, so an exporter leaves them out of the
 * skin's joint list and three creates a `Bone` only for nodes named there
 * (`GLTFLoader._markDefs`), making the rest plain `Object3D`. Indexing bones alone
 * lost the top of the head: the skull's capsule ended up 20 cm low, centred on
 * the neck, while the spec still reported a full set of segments.
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
 * Every vertex sorted into the bone that carries most of its weight, in that
 * bone's frame — the measurement the capsules were missing. A radius written as a
 * fraction of bone length is one guess reused for every body: fitted to a
 * full-height mannequin, it put a metre-tall body inside capsules half again too
 * wide for it.
 *
 * Bone-local because that is the frame in which "how far is this vertex from the
 * bone" has an answer, and because the inverse bind takes out whatever rescaling
 * `?meshopt` applied to the stored positions.
 */
/**
 * Cached per ASSET, keyed by geometry: this walks twenty thousand vertices and
 * allocated a `Vector3` for each, once per MOUNT — six to twelve times in a spawn
 * frame — for a result that cannot differ between clones (`cloneSkinned` shares
 * the geometry and copies `bindMatrix` and `boneInverses`).
 *
 * Not keyed on the applied scale, and must not be: the scale lands on the scene
 * root while the bind matrices come off the asset. A spec measured in the wrong
 * space is AGENTS.md rule 5.
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
 * so call it after the model's matrices are up to date. Returns null when the core
 * bones (hips plus a limb) are missing — the rig is not Mixamo-compatible.
 */
/**
 * Per-BODY choices about how its capsules are found. Options rather than
 * behaviour because two bodies here need different answers and neither is wrong.
 *
 * The authored fractions are deliberately slim at the trunk, and that slimness is
 * load-bearing: measured, widening it stops the mannequin settling at all, at
 * four, six and ten seconds. It is also wrong for a body shaped differently — on
 * a hunched rig with short trunk bones the same fractions collapse the pelvis to
 * its 3 cm floor and leave a torso half the thickness of its own thigh.
 */
export type RagdollFitOptions = {
  /**
   * Take each capsule's thickness from the MESH instead of the authored fraction
   * of bone length; see `measuredRadius` for why the obvious statistic measures a
   * garment rather than a body.
   *
   * Off by default, and the default is the point: it reshapes every capsule, and a
   * body that already settles has a working configuration to lose.
   */
  readonly capsulesFromMesh?: boolean
  /**
   * Whether this body's segments collide with each other. `trunk` (the default)
   * keeps contacts on the four joints that hold a limb out of the torso — the
   * hips and shoulders — which is what makes an arm lie ON the chest rather than
   * inside it. `off`: nothing in the body touches itself, only the world.
   */
  readonly selfCollision?: 'off' | 'trunk'
  /**
   * Multiplies every segment's angular damping, which decides whether a corpse
   * creeps or comes to rest.
   *
   * It travels with `capsulesFromMesh`, for a physical reason: a capsule fitted to
   * a thin limb has less contact and less drag than the fat authored one, so the
   * same body takes longer to stop. Measured on a body whose thighs went 0.132 ->
   * 0.055: it settled inside four seconds in one run out of three.
   */
  readonly angularDamping?: number
  /**
   * Scales the knee/elbow BUCKLE — the fold driven into the limbs for the first
   * moment after death so the body gives way instead of toppling. 0 disables it.
   *
   * Per-body because the reflex drives BOTH knees to the same angle, and the
   * result depends on what the legs were doing. Measured: killed standing, a body
   * settles in four runs out of four; killed mid-stride, two — the asymmetric pose
   * plus a symmetric fold leaves it on one knee, micro-moving.
   */
  readonly buckle?: number
  /**
   * Extra hip EXTENSION, in radians — how far the thigh may swing back past the
   * authored `[-75°, +15°]`, which is a human's range.
   *
   * MEASURED AND NOT USED. It was prescribed as the fix for a corpse landing with
   * its knees under it, and it makes that corpse worse: at 0.9 rad the body came
   * to rest in one run out of four against six out of six without it, and the
   * spread of where it lands grew from 0.11 to 0.17 m. More freedom in the hip is
   * more room to keep moving. Kept as an option for the next creature; zero here.
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
   * A bind pose is a POSE, not a resize: the skeleton is measured at the size the
   * body lives at, whatever size its bind matrices are expressed in.
   *
   * `Skeleton.pose()` rebuilds bones from `boneInverses`, and those need not be
   * in the live rig's space. `?meshopt` is exactly that case — quantization
   * rescales and re-centres vertex positions and compensates in the inverse binds,
   * so the drawn body is identical while the recovered bind pose comes back at a
   * different scale. Measured: an inverse-bind scale of 0.4998 against the source
   * asset's 1.0000, so `pose()` handed back a skeleton at TWICE size, every
   * capsule was measured twice as thick, and the body visibly doubled the instant
   * it died.
   *
   * Only the scale has to come out; the bind pose's absolute POSITION cancels,
   * since waking applies `bone.matrixWorld · bind⁻¹`. Only bones with no bone
   * parent are touched: `pose()` derives the rest from a parent that has already
   * absorbed the factor.
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
 * Where a segment's tail is when the rig has no node for it. Mixamo's leaf ends
 * are export-time extras, and a character rigged elsewhere to Mixamo bone NAMES
 * routinely has none — the head notices first, since its bone runs to a crown
 * that is not there.
 *
 * The guess CONTINUES the link that arrived at the bone: same direction, length a
 * measured proportion of it, so it scales with the rig. It used to be
 * `head + (0, -0.2, 0)` — a fifth of a metre straight down in world space
 * whichever way the bone pointed. Still a guess, and the DEV error says so.
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
  // One pass over the mesh at build time, shared by every segment below, and
  // walked only when the body ASKED for mesh-fitted capsules.
  //
  // It used to walk in DEV as well, so every body paid a full twenty-thousand
  // vertex pass on mount whether or not anything read the answer — and since the
  // build being profiled is the DEV build, the frame-cost work was measuring a
  // cost the shipped game does not have. The comparison is still reachable
  // through `capsulesFromMesh`, or `__ragdollRadii` on a body that asks.
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
    // The measurement does NOT only shrink, and this comment once said it did:
    // there is no `Math.min` below, and the mesh INFLATES on some rigs — measured
    // live, a pelvis goes 0.029 -> 0.137 and a thigh 0.132 -> 0.162. A shrink-only
    // cap was tried and reverted, and the verdict was recorded; the comment
    // describing it outlived the code by hours, which is how a reader ends up
    // trusting a guarantee nothing provides. A mannequin pelvis would go
    // 0.042 -> 0.162 the same way if it asked.
    /** Which answer this body asked for; the authored fraction stays the default. */
    /**
     * And never wider than the joint it carries. Measured when capsules were still
     * sized off a percentile that had counted a loincloth: pelvis 0.137 plus thigh
     * 0.162 against a hip anchor 0.094 from the pelvis axis — three to one overlap,
     * and a body that never settled. That arithmetic was later used to argue the
     * clamp could not work, using numbers the measurement no longer produces
     * (thigh 0.055 now): a conclusion has to be re-derived when its inputs move.
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
