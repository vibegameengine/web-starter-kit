import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const { AnimationMixer, Euler, Quaternion, Vector3 } = await import('three')
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')

const ROOTED_DIRECTORY = resolve('wip/rooted')
const GROUND_SPEEDS_FILE = resolve('src/features/motion/assets/animations/clipGroundSpeeds.json')
const DATABASE_FILE = resolve('src/features/motion/assets/animations/poseDatabase.json')
const SAMPLE_HZ = 30
const CENTIMETRES_PER_METRE = 100
const FUTURE_OFFSETS = [0.2, 0.4, 0.6]
const PAST_OFFSETS = [-0.3, -0.15]
const BONES = { hips: /Hips$/, leftFoot: /LeftFoot$/, rightFoot: /RightFoot$/ }

const FEATURE_WEIGHTS = {
  footPosition: 1,
  footVelocity: 0.4,
  hipsVelocity: 0.4,
  trajectoryHeading: 1,
  trajectoryPosition: 1.4,
}

function loadGlb(file) {
  const buffer = readFileSync(file)
  const loader = new GLTFLoader()
  return new Promise((done, failed) => {
    loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '', done, failed)
  })
}

function findBones(scene) {
  const found = {}
  scene.traverse((node) => {
    for (const [key, pattern] of Object.entries(BONES)) {
      if (!found[key] && pattern.test(node.name)) found[key] = node
    }
  })
  for (const key of Object.keys(BONES)) if (!found[key]) throw new Error(`clip rig has no ${key}`)
  return found
}

function unitScale(gltf, bones) {
  const point = new Vector3()
  gltf.scene.updateMatrixWorld(true)
  bones.hips.getWorldPosition(point)
  if (point.y > 10) return 1 / CENTIMETRES_PER_METRE
  if (point.y > 0.3) return 1
  throw new Error(`clip rig stands ${point.y} units tall, which is neither metres nor centimetres`)
}

function sampleClip(gltf, clip) {
  const bones = findBones(gltf.scene)
  const scale = unitScale(gltf, bones)
  const mixer = new AnimationMixer(gltf.scene)
  mixer.clipAction(clip).play()
  const rotation = new Quaternion()
  const euler = new Euler()
  const point = new Vector3()
  const frames = []
  const step = 1 / SAMPLE_HZ

  const read = (bone) => {
    bone.getWorldPosition(point)
    return [point.x * scale, point.y * scale, point.z * scale]
  }

  for (let time = 0; time < clip.duration; time += step) {
    mixer.setTime(time)
    gltf.scene.updateMatrixWorld(true)
    bones.hips.getWorldQuaternion(rotation)
    euler.setFromQuaternion(rotation, 'YXZ')
    frames.push({ hips: read(bones.hips), left: read(bones.leftFoot), right: read(bones.rightFoot), time, yaw: euler.y })
  }
  return frames
}

function intoLocal(frame, point) {
  const dx = point[0] - frame.hips[0]
  const dz = point[2] - frame.hips[2]
  const cos = Math.cos(-frame.facing)
  const sin = Math.sin(-frame.facing)
  return [dx * cos + dz * sin, point[1], dz * cos - dx * sin]
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function travelHeading(frames) {
  const first = frames[0].hips
  const last = frames[frames.length - 1].hips
  return Math.atan2(last[0] - first[0], last[2] - first[2])
}

function meanYaw(frames) {
  const sin = frames.reduce((sum, frame) => sum + Math.sin(frame.yaw), 0) / frames.length
  const cos = frames.reduce((sum, frame) => sum + Math.cos(frame.yaw), 0) / frames.length
  return Math.atan2(sin, cos)
}

function withFacing(frames, hipsToFacing) {
  return frames.map((frame) => ({ ...frame, facing: normalizeAngle(frame.yaw + hipsToFacing) }))
}

function localVelocity(frames, index, key) {
  const previous = frames[Math.max(0, index - 1)]
  const current = frames[index]
  const seconds = Math.max(1e-4, current.time - previous.time)
  const before = intoLocal(current, previous[key])
  const after = intoLocal(current, current[key])
  return [
    (after[0] - before[0]) / seconds,
    (after[1] - before[1]) / seconds,
    (after[2] - before[2]) / seconds,
  ]
}

function loopedFrameAt(frames, seconds) {
  const count = frames.length
  const index = Math.round(seconds * SAMPLE_HZ)
  const loops = Math.floor(index / count)
  const wrapped = index - loops * count
  const cycle = [
    frames[count - 1].hips[0] - frames[0].hips[0],
    0,
    frames[count - 1].hips[2] - frames[0].hips[2],
  ]
  const frame = frames[wrapped]
  return {
    ...frame,
    hips: [frame.hips[0] + cycle[0] * loops, frame.hips[1], frame.hips[2] + cycle[2] * loops],
  }
}

function trajectoryFeatures(frames, index) {
  const current = frames[index]
  const positions = []
  const headings = []
  for (const offset of [...PAST_OFFSETS, ...FUTURE_OFFSETS]) {
    const sample = loopedFrameAt(frames, current.time + offset)
    const local = intoLocal(current, sample.hips)
    positions.push(local[0], local[2])
    const heading = sample.facing - current.facing
    headings.push(Math.sin(heading), Math.cos(heading))
  }
  return { headings, positions }
}

function featureVector(frames, index) {
  const current = frames[index]
  const left = intoLocal(current, current.left)
  const right = intoLocal(current, current.right)
  const { headings, positions } = trajectoryFeatures(frames, index)
  return [
    ...left,
    ...right,
    ...localVelocity(frames, index, 'left'),
    ...localVelocity(frames, index, 'right'),
    ...localVelocity(frames, index, 'hips'),
    ...positions,
    ...headings,
  ]
}

function weightVector(sampleCount) {
  const weights = []
  for (let index = 0; index < 6; index += 1) weights.push(FEATURE_WEIGHTS.footPosition)
  for (let index = 0; index < 6; index += 1) weights.push(FEATURE_WEIGHTS.footVelocity)
  for (let index = 0; index < 3; index += 1) weights.push(FEATURE_WEIGHTS.hipsVelocity)
  for (let index = 0; index < sampleCount * 2; index += 1) weights.push(FEATURE_WEIGHTS.trajectoryPosition)
  for (let index = 0; index < sampleCount * 2; index += 1) weights.push(FEATURE_WEIGHTS.trajectoryHeading)
  return weights
}

async function rawFrames(file) {
  const gltf = await loadGlb(join(ROOTED_DIRECTORY, file))
  if (gltf.animations.length !== 1) throw new Error(`${file} holds ${gltf.animations.length} clips, expected one`)

  const clip = gltf.animations[0]
  const frames = sampleClip(gltf, clip)
  if (frames.length < 4) throw new Error(`${file} is too short to index: ${frames.length} frames`)
  return frames
}

function indexFrames(clipId, frames) {
  return frames.map((frame, index) => ({
    clipId,
    features: featureVector(frames, index).map((value) => Number(value.toFixed(4))),
    time: Number(frame.time.toFixed(4)),
  }))
}

const verified = JSON.parse(readFileSync(GROUND_SPEEDS_FILE, 'utf8'))
const files = verified.map((entry) => `${entry.clip}.glb`)
for (const file of files) {
  if (!existsSync(join(ROOTED_DIRECTORY, file))) {
    throw new Error(`${file} is missing from ${ROOTED_DIRECTORY} — run node scripts/measure-ground-speeds.mjs`)
  }
}

const REFERENCE_CLIP = 'walk-forward'
const rawByClip = new Map()
for (const entry of verified) rawByClip.set(entry.clip, await rawFrames(`${entry.clip}.glb`))

const reference = rawByClip.get(REFERENCE_CLIP)
if (!reference) throw new Error(`${REFERENCE_CLIP} must be measured before the database can be framed`)
const hipsToFacing = normalizeAngle(travelHeading(reference) - meanYaw(reference))

const MIRRORED_CLIPS = { 'walk-strafe-right': 'walk-strafe-left' }
const POSE_BLOCKS = { feetPositions: 6, feetVelocities: 6, hipsVelocity: 3 }

function mirroredFeatures(features, offsetCount) {
  const mirrored = [...features]
  const swapTriples = (a, b) => {
    for (let index = 0; index < 3; index += 1) {
      const left = features[a + index]
      const right = features[b + index]
      mirrored[a + index] = index === 0 ? -right : right
      mirrored[b + index] = index === 0 ? -left : left
    }
  }
  swapTriples(0, 3)
  swapTriples(6, 9)
  mirrored[12] = -features[12]

  const positions = POSE_BLOCKS.feetPositions + POSE_BLOCKS.feetVelocities + POSE_BLOCKS.hipsVelocity
  for (let index = 0; index < offsetCount * 2; index += 2) mirrored[positions + index] = -features[positions + index]
  const headings = positions + offsetCount * 2
  for (let index = 0; index < offsetCount * 2; index += 2) mirrored[headings + index] = -features[headings + index]
  return mirrored
}

const poses = []
for (const [clipId, frames] of rawByClip) {
  const indexed = indexFrames(clipId, withFacing(frames, hipsToFacing))
  poses.push(...indexed)
  const mirroredId = MIRRORED_CLIPS[clipId]
  if (!mirroredId) continue
  poses.push(...indexed.map((pose) => ({
    clipId: mirroredId,
    features: mirroredFeatures(pose.features, [...PAST_OFFSETS, ...FUTURE_OFFSETS].length),
    time: pose.time,
  })))
}

const offsets = [...PAST_OFFSETS, ...FUTURE_OFFSETS]
const database = {
  dimensions: poses[0].features.length,
  poses,
  sampleHz: SAMPLE_HZ,
  trajectoryOffsets: offsets,
  weights: weightVector(offsets.length),
}
if (database.weights.length !== database.dimensions) {
  throw new Error(`weights (${database.weights.length}) do not match dimensions (${database.dimensions})`)
}
writeFileSync(DATABASE_FILE, `${JSON.stringify(database)}\n`)

const perClip = new Map()
for (const pose of poses) perClip.set(pose.clipId, (perClip.get(pose.clipId) ?? 0) + 1)
console.log(`poses ${poses.length}  dimensions ${database.dimensions}  hips-to-facing ${(hipsToFacing * 180 / Math.PI).toFixed(1)} deg`)
for (const [clipId, count] of perClip) console.log(`  ${clipId.padEnd(16)} ${String(count).padStart(4)} poses`)
