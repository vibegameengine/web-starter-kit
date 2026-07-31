import { Object3D, Quaternion, Vector3 } from 'three'

import { normalizeBoneName } from './mixamoRig'

/**
 * Start poses for the ragdoll lab. The mannequin ships in a bare T-pose, which is
 * the WORST case to judge a collapse from — nobody stands like that, and a body
 * dropped from it splays in ways a real fall never produces. These pose the skeleton
 * before the physics bodies are built (`buildRagdollSpec` reads bone world
 * transforms), so each start reads as a different moment of being upright.
 *
 * A pose aims bones at WORLD directions rather than listing local Euler angles.
 * Mirrored left/right bones do not share a sign convention — hand-written angles
 * lowered one arm and left the other sticking out — whereas "this limb points down
 * and slightly forward" is unambiguous and carries to any Mixamo rig unchanged.
 * +Z is the character's forward.
 */
export type StartPose = {
  readonly id: string
  readonly label: string
  /** Bone name → world direction the bone should point (need not be normalised). */
  readonly aim: readonly (readonly [bone: string, x: number, y: number, z: number])[]
}

export const START_POSES: readonly StartPose[] = [
  { id: 'tpose', label: 'T-pose', aim: [] },
  {
    id: 'idle',
    label: 'Stand',
    aim: [
      ['leftarm', -0.25, -1, 0], ['rightarm', 0.25, -1, 0],
      ['leftforearm', -0.15, -1, 0.25], ['rightforearm', 0.15, -1, 0.25],
    ],
  },
  {
    id: 'walk',
    label: 'Stride',
    aim: [
      ['leftarm', -0.3, -1, -0.45], ['rightarm', 0.3, -1, 0.45],
      ['leftforearm', -0.2, -1, 0.1], ['rightforearm', 0.2, -1, 0.5],
      ['leftupleg', 0, -1, 0.5], ['rightupleg', 0, -1, -0.45],
      ['leftleg', 0, -1, 0.1], ['rightleg', 0, -1, -0.7],
    ],
  },
  {
    id: 'crouch',
    label: 'Crouch',
    aim: [
      ['leftarm', -0.35, -1, 0.3], ['rightarm', 0.35, -1, 0.3],
      ['leftforearm', -0.2, -0.5, 1], ['rightforearm', 0.2, -0.5, 1],
      ['leftupleg', -0.15, -1, 0.9], ['rightupleg', 0.15, -1, 0.9],
      ['leftleg', -0.1, -1, -0.7], ['rightleg', 0.1, -1, -0.7],
      ['spine', 0, 1, 0.35],
    ],
  },
]

/** World direction a bone points, taken from its first child bone. */
function currentDirection(bone: Object3D, out: Vector3): Vector3 | null {
  const child = bone.children.find((candidate) => (candidate as { isBone?: boolean }).isBone)
  if (!child) return null
  bone.getWorldPosition(from)
  child.getWorldPosition(to)
  const direction = out.subVectors(to, from)
  return direction.lengthSq() > 1e-10 ? direction.normalize() : null
}

/** Applies a pose to `root`'s skeleton in place, on top of whatever it holds now. */
export function applyStartPose(root: Object3D, pose: StartPose): void {
  if (pose.aim.length === 0) return
  root.updateWorldMatrix(true, true)

  const bones = new Map<string, Object3D>()
  root.traverse((object) => {
    if ((object as { isBone?: boolean }).isBone) bones.set(normalizeBoneName(object.name), object)
  })

  // Parents first: aiming a thigh moves the shin with it, so the shin must be aimed
  // afterwards, against its parent's final orientation.
  for (const [name, x, y, z] of pose.aim) {
    const bone = bones.get(name)
    if (!bone?.parent) continue
    root.updateWorldMatrix(true, true)
    const current = currentDirection(bone, direction)
    if (!current) continue

    target.set(x, y, z).normalize()
    // Rotation in WORLD space, then expressed in the parent's frame, which is where
    // a bone's local quaternion lives.
    delta.setFromUnitVectors(current, target)
    bone.getWorldQuaternion(boneWorld)
    bone.parent.getWorldQuaternion(parentWorld)
    bone.quaternion.copy(parentWorld.invert()).multiply(delta).multiply(boneWorld)
  }

  root.updateWorldMatrix(true, true)
}

const from = new Vector3()
const to = new Vector3()
const direction = new Vector3()
const target = new Vector3()
const delta = new Quaternion()
const boneWorld = new Quaternion()
const parentWorld = new Quaternion()
