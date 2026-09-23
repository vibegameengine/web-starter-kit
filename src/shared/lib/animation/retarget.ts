import { AnimationClip, AnimationMixer, LoopOnce, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'
import type { KeyframeTrack, Object3D } from 'three'

/* @important Moving a clip between two skeletons is not a rename. docs/animation-retargeting.md
   has the method, the measurements it was checked against and the dead ends. */

export type RetargetBone = {
  readonly align?: boolean
  readonly source: string
  readonly target: string
  readonly toward?: string
  readonly translate?: boolean
}

export type HipLine = {
  readonly left: Vector3
  readonly right: Vector3
}

export type RetargetInput = {
  readonly clip: AnimationClip
  readonly hips?: { readonly source: readonly [string, string]; readonly target: readonly [string, string] }
  readonly map: readonly RetargetBone[]
  readonly source: Object3D
  readonly target: Object3D
}

export function retargetedRotation(
  sourceNow: Quaternion,
  sourceReference: Quaternion,
  targetRest: Quaternion,
  facing: Quaternion,
): Quaternion {
  const change = sourceNow.clone().multiply(sourceReference.clone().invert())
  const faced = facing.clone().multiply(change).multiply(facing.clone().invert())
  return faced.multiply(targetRest)
}

function level(vector: Vector3): Vector3 {
  return new Vector3(vector.x, 0, vector.z)
}

export function facingAlignment(source: HipLine, target: HipLine): Quaternion {
  const from = level(source.left.clone().sub(source.right))
  const to = level(target.left.clone().sub(target.right))
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return new Quaternion()
  return new Quaternion().setFromUnitVectors(from.normalize(), to.normalize())
}

export function limbAlignment(sourceDirection: Vector3, targetDirection: Vector3, facing: Quaternion): Quaternion {
  const from = sourceDirection.clone().normalize().applyQuaternion(facing)
  const to = targetDirection.clone().normalize()
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return new Quaternion()
  return new Quaternion().setFromUnitVectors(from, to)
}

function nodeNamed(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null
  root.traverse((node) => {
    if (!found && node.name === name) found = node
  })
  return found
}

function nodeEndingWith(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null
  root.traverse((node) => {
    if (!found && (node.name === name || new RegExp(`(^|[:_]|mixamorig\\d*)${name}$`).test(node.name))) found = node
  })
  return found
}

function depthOf(node: Object3D): number {
  let depth = 0
  for (let parent = node.parent; parent; parent = parent.parent) depth += 1
  return depth
}

function worldQuaternion(node: Object3D): Quaternion {
  return node.getWorldQuaternion(new Quaternion())
}

function worldPosition(node: Object3D): Vector3 {
  return node.getWorldPosition(new Vector3())
}

type BoundBone = {
  readonly entry: RetargetBone
  readonly reference: Quaternion
  readonly source: Object3D
  readonly target: Object3D
  readonly targetRest: Quaternion
  readonly sourceRestPosition: Vector3
  readonly targetRestPosition: Vector3
}

function hipLineOf(root: Object3D, names: readonly [string, string], find: (root: Object3D, name: string) => Object3D | null): HipLine | null {
  const left = find(root, names[0])
  const right = find(root, names[1])
  return left && right ? { left: worldPosition(left), right: worldPosition(right) } : null
}

function facingOf(input: RetargetInput): Quaternion {
  if (!input.hips) return new Quaternion()
  const source = hipLineOf(input.source, input.hips.source, nodeNamed)
  const target = hipLineOf(input.target, input.hips.target, nodeEndingWith)
  return source && target ? facingAlignment(source, target) : new Quaternion()
}

function referenceFor(entry: RetargetBone, input: RetargetInput, sourceNode: Object3D, facing: Quaternion): Quaternion {
  const sourceRest = worldQuaternion(sourceNode)
  if (!entry.align || !entry.toward) return sourceRest
  const towardEntry = input.map.find((candidate) => candidate.source === entry.toward)
  const sourceToward = nodeNamed(input.source, entry.toward)
  const targetNode = nodeEndingWith(input.target, entry.target)
  const targetToward = towardEntry ? nodeEndingWith(input.target, towardEntry.target) : null
  if (!sourceToward || !targetNode || !targetToward) return sourceRest
  const alignment = limbAlignment(
    worldPosition(sourceToward).sub(worldPosition(sourceNode)),
    worldPosition(targetToward).sub(worldPosition(targetNode)),
    facing,
  )
  const inverseFacing = facing.clone().invert()
  return inverseFacing.multiply(alignment).multiply(facing).multiply(sourceRest)
}

function bind(input: RetargetInput, facing: Quaternion): BoundBone[] {
  const bound: BoundBone[] = []
  for (const entry of input.map) {
    const source = nodeNamed(input.source, entry.source)
    const target = nodeEndingWith(input.target, entry.target)
    if (!source || !target) continue
    bound.push({
      entry,
      reference: referenceFor(entry, input, source, facing),
      source,
      sourceRestPosition: worldPosition(source),
      target,
      targetRest: worldQuaternion(target),
      targetRestPosition: worldPosition(target),
    })
  }
  return bound.sort((left, right) => depthOf(left.target) - depthOf(right.target))
}

function keyTimes(clip: AnimationClip): number[] {
  const times = new Set<number>()
  for (const track of clip.tracks) for (const time of track.times) times.add(Number(time.toFixed(5)))
  if (times.size === 0) times.add(0)
  return [...times].sort((left, right) => left - right)
}

function heightRatio(bone: BoundBone, input: RetargetInput): number {
  const sourceHeight = bone.sourceRestPosition.y - worldPosition(input.source).y
  const targetHeight = bone.targetRestPosition.y - worldPosition(input.target).y
  return Math.abs(sourceHeight) > 1e-9 ? targetHeight / sourceHeight : 1
}

type Samples = { readonly positions: number[]; readonly rotations: number[]; readonly scale: number }

function poseTarget(bone: BoundBone, facing: Quaternion, samples: Samples): void {
  const { positions, rotations, scale } = samples
  const parent = bone.target.parent
  const desired = retargetedRotation(worldQuaternion(bone.source), bone.reference, bone.targetRest, facing)
  const parentWorld = parent ? worldQuaternion(parent) : new Quaternion()
  bone.target.quaternion.copy(parentWorld.invert().multiply(desired))
  rotations.push(...bone.target.quaternion.toArray())
  if (bone.entry.translate) {
    const travel = worldPosition(bone.source).sub(bone.sourceRestPosition).applyQuaternion(facing).multiplyScalar(scale)
    const world = bone.targetRestPosition.clone().add(travel)
    bone.target.position.copy(parent ? parent.worldToLocal(world) : world)
    positions.push(...bone.target.position.toArray())
  }
  bone.target.updateMatrixWorld(true)
}

type RestState = { readonly node: Object3D; readonly position: Vector3; readonly quaternion: Quaternion }

function remember(bones: readonly BoundBone[]): RestState[] {
  return bones.map((bone) => ({ node: bone.target, position: bone.target.position.clone(), quaternion: bone.target.quaternion.clone() }))
}

function restore(states: readonly RestState[], target: Object3D): void {
  for (const state of states) {
    state.node.position.copy(state.position)
    state.node.quaternion.copy(state.quaternion)
  }
  target.updateMatrixWorld(true)
}

function sampleTracks(input: RetargetInput, bones: readonly BoundBone[], facing: Quaternion): KeyframeTrack[] {
  const times = keyTimes(input.clip)
  const samples: Samples[] = bones.map((bone) => ({
    positions: [],
    rotations: [],
    scale: bone.entry.translate ? heightRatio(bone, input) : 1,
  }))
  const mixer = new AnimationMixer(input.source)
  const action = mixer.clipAction(input.clip)
  action.setLoop(LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  for (const time of times) {
    mixer.setTime(time)
    input.source.updateMatrixWorld(true)
    bones.forEach((bone, index) => poseTarget(bone, facing, samples[index]))
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(input.source)
  const tracks: KeyframeTrack[] = []
  bones.forEach((bone, index) => {
    tracks.push(new QuaternionKeyframeTrack(`${bone.target.name}.quaternion`, times, samples[index].rotations))
    if (bone.entry.translate) tracks.push(new VectorKeyframeTrack(`${bone.target.name}.position`, times, samples[index].positions))
  })
  return tracks
}

export function retargetClip(input: RetargetInput): AnimationClip {
  input.source.updateMatrixWorld(true)
  input.target.updateMatrixWorld(true)
  const facing = facingOf(input)
  const bones = bind(input, facing)
  const rest = remember(bones)
  const tracks = sampleTracks(input, bones, facing)
  restore(rest, input.target)
  return new AnimationClip(input.clip.name, input.clip.duration, tracks)
}

function side(letter: 'l' | 'r'): RetargetBone[] {
  const mixamo = letter === 'l' ? 'Left' : 'Right'
  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((finger) => [1, 2, 3].map((joint): RetargetBone => ({
    align: joint < 3,
    source: `${finger}_0${joint}_${letter}`,
    target: `${mixamo}Hand${finger[0].toUpperCase()}${finger.slice(1)}${joint}`,
    toward: joint < 3 ? `${finger}_0${joint + 1}_${letter}` : undefined,
  })))
  return [
    { source: `clavicle_${letter}`, target: `${mixamo}Shoulder` },
    { align: true, source: `upperarm_${letter}`, target: `${mixamo}Arm`, toward: `lowerarm_${letter}` },
    { align: true, source: `lowerarm_${letter}`, target: `${mixamo}ForeArm`, toward: `hand_${letter}` },
    { source: `hand_${letter}`, target: `${mixamo}Hand` },
    ...fingers,
    { align: true, source: `thigh_${letter}`, target: `${mixamo}UpLeg`, toward: `calf_${letter}` },
    { align: true, source: `calf_${letter}`, target: `${mixamo}Leg`, toward: `foot_${letter}` },
    { source: `foot_${letter}`, target: `${mixamo}Foot` },
    { source: `ball_${letter}`, target: `${mixamo}ToeBase` },
  ]
}

export const UE5_TO_MIXAMO: readonly RetargetBone[] = [
  { source: 'pelvis', target: 'Hips', translate: true },
  { source: 'spine_01', target: 'Spine' },
  { source: 'spine_02', target: 'Spine1' },
  { source: 'spine_03', target: 'Spine2' },
  { source: 'neck_01', target: 'Neck' },
  { source: 'Head', target: 'Head' },
  ...side('l'),
  ...side('r'),
]

export const UE5_TO_MIXAMO_HIPS = { source: ['thigh_l', 'thigh_r'], target: ['LeftUpLeg', 'RightUpLeg'] } as const

