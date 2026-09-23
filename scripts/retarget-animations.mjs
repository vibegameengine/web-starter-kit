/* @important Moves clips out of an animation library built on another skeleton
   and onto this project's Mixamo rig, the way the rig is actually loaded at
   runtime.

     node scripts/retarget-animations.mjs            # every clip in CLIPS
     node scripts/retarget-animations.mjs Jump_Loop  # just the named ones

   The target is the mannequin put through fbx2gltf exactly as the Vite FBX
   plugin does it, never FBXLoader's reading of the same file: the clip writes
   LOCAL rotations, and a local rotation only means something against the
   node it was computed for. The retargeting itself is
   src/shared/lib/animation/retarget.ts; docs/animation-retargeting.md has
   the method and what it was checked against.

   Every clip is reported with the worst angle, over all frames and limbs,
   between where a source bone points and where the retargeted bone points.
   It is the check that the transfer is a transfer: the pose may be anything,
   but the limbs must agree with the source's. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import convertFbxToGltf from 'fbx2gltf'

import { retargetClip, UE5_TO_MIXAMO, UE5_TO_MIXAMO_HIPS } from '../src/shared/lib/animation/retarget.ts'

globalThis.self = globalThis
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      if (this.onloadend) this.onloadend()
    })
  }
}

const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
const { AnimationMixer, Vector3 } = await import('three')

const LIBRARY = resolve('src/features/motion/assets/library/UAL1_Standard.glb')
const TARGET_RIG = resolve('src/features/ragdoll/assets/models/default-humanoid.fbx')
const TARGET_DIRECTORY = resolve('src/features/motion/assets/animations')

const CLIPS = [
  { name: 'jump-start', source: 'Jump_Start' },
  { name: 'jump-loop', source: 'Jump_Loop' },
  { name: 'jump-land', source: 'Jump_Land' },
]

const LIMBS = [
  ['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'],
  ['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r'],
  ['foot_l', 'ball_l'], ['foot_r', 'ball_r'], ['spine_01', 'neck_01'],
]

function arrayBufferOf(path) {
  const buffer = readFileSync(path)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

async function loadGlb(path) {
  return await new Promise((done, failed) => new GLTFLoader().parse(arrayBufferOf(path), '', done, failed))
}

async function runtimeRig() {
  const directory = mkdtempSync(join(tmpdir(), 'retarget-rig-'))
  try {
    const out = join(directory, 'rig.glb')
    await convertFbxToGltf(TARGET_RIG, out, ['--binary'])
    return (await loadGlb(out)).scene
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

function nodeNamed(root, pattern) {
  let found = null
  root.traverse((node) => {
    if (!found && pattern.test(node.name)) found = node
  })
  return found
}

function targetPatternOf(sourceName) {
  const entry = UE5_TO_MIXAMO.find((bone) => bone.source === sourceName)
  return new RegExp(`(^|[:_]|mixamorig\\d*)${entry.target}$`)
}

function directionOf(root, from, to) {
  const start = from.getWorldPosition(new Vector3())
  return to.getWorldPosition(new Vector3()).sub(start).normalize()
}

function worstLimbError(source, sourceClip, target, targetClip) {
  const sourceMixer = new AnimationMixer(source)
  const targetMixer = new AnimationMixer(target)
  sourceMixer.clipAction(sourceClip).play()
  targetMixer.clipAction(targetClip).play()
  let worst = { degrees: 0, limb: '', time: 0 }
  const times = targetClip.tracks[0]?.times ?? [0]
  for (const time of times) {
    sourceMixer.setTime(time)
    targetMixer.setTime(time)
    source.updateMatrixWorld(true)
    target.updateMatrixWorld(true)
    for (const [from, to] of LIMBS) {
      const sourceDirection = directionOf(source, nodeNamed(source, new RegExp(`^${from}$`)), nodeNamed(source, new RegExp(`^${to}$`)))
      const targetDirection = directionOf(target, nodeNamed(target, targetPatternOf(from)), nodeNamed(target, targetPatternOf(to)))
      const degrees = (sourceDirection.angleTo(targetDirection) * 180) / Math.PI
      if (degrees > worst.degrees) worst = { degrees, limb: `${from}>${to}`, time }
    }
  }
  sourceMixer.stopAllAction()
  targetMixer.stopAllAction()
  return worst
}

function pelvisRange(target, clip) {
  const mixer = new AnimationMixer(target)
  mixer.clipAction(clip).play()
  const hips = nodeNamed(target, /Hips$/)
  let low = Infinity
  let high = -Infinity
  for (const time of clip.tracks[0]?.times ?? [0]) {
    mixer.setTime(time)
    target.updateMatrixWorld(true)
    const height = hips.getWorldPosition(new Vector3()).y
    low = Math.min(low, height)
    high = Math.max(high, height)
  }
  mixer.stopAllAction()
  return { high, low }
}

/* @important The clips this project already plays are Mixamo's, in centimetres,
   and the runtime scales every clip by one factor taken from the idle clip:
   the rig's hips height over the idle's first hips key (clipScale.ts). A clip
   retargeted onto the fbx2gltf rig comes out in the rig's metres, and would be
   shrunk a hundredfold by that factor. So its positions are written in the
   family's units — multiplied by exactly the inverse of what the runtime will
   apply — and the runtime stays one convention with one scale. */
async function familyUnitScale(target) {
  const idle = await loadGlb(join(TARGET_DIRECTORY, 'idle.glb'))
  const track = idle.animations[0].tracks.find((candidate) => /Hips\.position$/.test(candidate.name))
  const hips = nodeNamed(target, /Hips$/)
  target.updateMatrixWorld(true)
  const rigHeight = target.worldToLocal(hips.getWorldPosition(new Vector3())).y
  return track.values[1] / rigHeight
}

function inFamilyUnits(clip, scale) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue
    for (let index = 0; index < track.values.length; index += 1) track.values[index] *= scale
  }
  return clip
}

function bonesOnly(scene) {
  const copy = scene.clone(true)
  const meshes = []
  copy.traverse((node) => {
    if (node.isMesh) meshes.push(node)
  })
  for (const mesh of meshes) mesh.parent.remove(mesh)
  return copy
}

async function exportGlb(skeleton, clip) {
  return await new Promise((done, failed) => {
    new GLTFExporter().parse(skeleton, done, failed, { animations: [clip], binary: true })
  })
}

const wanted = process.argv.slice(2)
const chosen = wanted.length > 0 ? CLIPS.filter((clip) => wanted.includes(clip.source)) : CLIPS
const library = await loadGlb(LIBRARY)
const target = await runtimeRig()
mkdirSync(TARGET_DIRECTORY, { recursive: true })
const unitScale = await familyUnitScale(target)
console.log(`positions written in the clip family's units: x${unitScale.toFixed(3)} of the rig's`)

console.log('clip          seconds  keys  pelvis m (low-high)  worst limb error')
for (const entry of chosen) {
  const sourceClip = library.animations.find((clip) => clip.name === entry.source)
  if (!sourceClip) throw new Error(`the library has no clip named ${entry.source}`)
  const clip = retargetClip({ clip: sourceClip, hips: UE5_TO_MIXAMO_HIPS, map: UE5_TO_MIXAMO, source: library.scene, target })
  clip.name = entry.name
  const error = worstLimbError(library.scene, sourceClip, target, clip)
  const pelvis = pelvisRange(target, clip)
  const glb = await exportGlb(bonesOnly(target), inFamilyUnits(clip.clone(), unitScale))
  writeFileSync(join(TARGET_DIRECTORY, `${entry.name}.glb`), Buffer.from(glb))
  console.log([
    entry.name.padEnd(12),
    clip.duration.toFixed(3).padStart(7),
    String(clip.tracks[0]?.times.length ?? 0).padStart(5),
    `${pelvis.low.toFixed(3)}-${pelvis.high.toFixed(3)}`.padStart(20),
    `${error.degrees.toFixed(2)} deg on ${error.limb} at ${error.time.toFixed(2)} s`.padStart(34),
  ].join('  '))
}
