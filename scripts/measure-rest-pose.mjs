/* @important Prints a rig's rest pose beside a clip's first frame, bone by bone,
   for the leg chain and the hips.

     node scripts/measure-rest-pose.mjs [clip.fbx]

   A clip authored against one skeleton and played on another puts the legs
   wherever the difference between the two rest poses happens to land. That
   shows up as a stance nobody authored — knees drawn together, toes turned in —
   and it is invisible in the numbers a motion check looks at, because every
   bone length, every joint angle and every foot plant is still perfectly legal.
   The only way to see it is to compare the two poses directly, which is what
   this prints. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      if (this.onloadend) this.onloadend()
    })
  }
}

const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
const { Euler, Quaternion } = await import('three')

const RIG = resolve('src/features/ragdoll/assets/models/default-humanoid.fbx')
const CLIP = resolve(process.argv[2] ?? 'wip/animations/Idle.fbx')
const CHAIN = /(Hips|LeftUpLeg|LeftLeg|LeftFoot|RightUpLeg|RightLeg|RightFoot)$/

function parseFbx(file) {
  const buffer = readFileSync(file)
  return new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
}

function degrees(radians) {
  return (radians * 180) / Math.PI
}

function eulerOf(quaternion) {
  const euler = new Euler().setFromQuaternion(quaternion, 'XYZ')
  return [euler.x, euler.y, euler.z].map((value) => degrees(value).toFixed(1).padStart(7))
}

function restPose(root) {
  const bones = new Map()
  root.traverse((node) => {
    if (CHAIN.test(node.name) && !bones.has(node.name)) bones.set(node.name, node)
  })
  return bones
}

function firstFrames(clip) {
  const frames = new Map()
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue
    const bone = track.name.slice(0, -'.quaternion'.length)
    if (!CHAIN.test(bone)) continue
    frames.set(bone, new Quaternion(track.values[0], track.values[1], track.values[2], track.values[3]))
  }
  return frames
}

const rig = restPose(parseFbx(RIG))
const clipScene = parseFbx(CLIP)
const clipRest = restPose(clipScene)
const clipFrames = firstFrames(clipScene.animations[0])

console.log(`rig   ${RIG}`)
console.log(`clip  ${CLIP}\n`)
console.log('bone                        rig rest (deg)        clip rest (deg)       clip frame 0 (deg)')

for (const [name, bone] of rig) {
  const rigRest = eulerOf(bone.quaternion).join(' ')
  const clipBone = clipRest.get(name)
  const clipRestAngles = clipBone ? eulerOf(clipBone.quaternion).join(' ') : '      -       -       -'
  const frame = clipFrames.get(name)
  const frameAngles = frame ? eulerOf(frame).join(' ') : '      -       -       -'
  console.log(`${name.padEnd(26)} ${rigRest}  ${clipRestAngles}  ${frameAngles}`)
}

const hipsRig = rig.get('mixamorigHips') ?? rig.get('Hips')
const hipsClip = clipRest.get('mixamorigHips') ?? clipRest.get('Hips')
if (hipsRig && hipsClip) {
  console.log(`\nhips height: rig ${hipsRig.position.y.toFixed(3)}, clip ${hipsClip.position.y.toFixed(3)}`)
}

for (const side of ['Left', 'Right']) {
  const thigh = [...rig.entries()].find(([name]) => name.endsWith(`${side}UpLeg`))
  if (!thigh) continue
  const position = thigh[1].position
  console.log(`${side} thigh offset from hips: ${[position.x, position.y, position.z].map((v) => v.toFixed(3)).join(', ')}`)
}
