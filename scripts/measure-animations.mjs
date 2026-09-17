import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const { AnimationMixer, Euler, Quaternion, Vector3 } = await import('three')
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')

const CLIP_DIRECTORY = resolve('src/features/motion/assets/animations')
const METRICS_FILE = join(CLIP_DIRECTORY, 'clipMetrics.json')
const SAMPLE_HZ = 60
const CENTIMETRES_PER_METRE = 100
const CONTACT_HEIGHT_FRACTION = 0.3
const STANCE_HEIGHT_FRACTION = 0.3
const BONE_NAMES = { hips: /Hips$/, leftFoot: /LeftFoot$/, rightFoot: /RightFoot$/ }

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
    for (const [key, pattern] of Object.entries(BONE_NAMES)) {
      if (!found[key] && pattern.test(node.name)) found[key] = node
    }
  })
  for (const key of Object.keys(BONE_NAMES)) {
    if (!found[key]) throw new Error(`clip rig has no ${key} bone`)
  }
  return found
}

function sampleClip(scene, clip) {
  const bones = findBones(scene)
  const mixer = new AnimationMixer(scene)
  mixer.clipAction(clip).play()
  const step = 1 / SAMPLE_HZ
  const frames = []
  const world = new Vector3()
  const rotation = new Quaternion()
  const euler = new Euler()

  for (let time = 0; time < clip.duration; time += step) {
    mixer.setTime(time)
    scene.updateMatrixWorld(true)
    const read = (bone) => {
      bone.getWorldPosition(world)
      return { x: world.x, y: world.y, z: world.z }
    }
    bones.hips.getWorldQuaternion(rotation)
    euler.setFromQuaternion(rotation, 'YXZ')
    frames.push({
      hips: read(bones.hips),
      left: read(bones.leftFoot),
      right: read(bones.rightFoot),
      time,
      yaw: euler.y,
    })
  }
  return frames
}

function relativeToHips(frame, side) {
  const x = (frame[side].x - frame.hips.x) / CENTIMETRES_PER_METRE
  const z = (frame[side].z - frame.hips.z) / CENTIMETRES_PER_METRE
  const cos = Math.cos(-frame.yaw)
  const sin = Math.sin(-frame.yaw)
  return {
    x: x * cos + z * sin,
    y: frame[side].y / CENTIMETRES_PER_METRE,
    z: z * cos - x * sin,
  }
}

function contactThreshold(frames, side) {
  const heights = frames.map((frame) => frame[side].y / CENTIMETRES_PER_METRE)
  const lowest = Math.min(...heights)
  const highest = Math.max(...heights)
  return lowest + (highest - lowest) * CONTACT_HEIGHT_FRACTION
}

function stanceSpeeds(frames, side) {
  const threshold = contactThreshold(frames, side)
  const speeds = []
  for (let index = 1; index < frames.length; index += 1) {
    const previous = relativeToHips(frames[index - 1], side)
    const current = relativeToHips(frames[index], side)
    if (current.y > threshold || previous.y > threshold) continue
    const delta = frames[index].time - frames[index - 1].time
    speeds.push(Math.hypot(current.x - previous.x, current.z - previous.z) / delta)
  }
  return speeds
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function contactShare(frames, side) {
  const threshold = contactThreshold(frames, side)
  const grounded = frames.filter((frame) => frame[side].y / CENTIMETRES_PER_METRE <= threshold)
  return grounded.length / frames.length
}

function stanceWindow(frames, side) {
  const threshold = contactThreshold(frames, side)
  const grounded = frames.map((frame) => frame[side].y / CENTIMETRES_PER_METRE <= threshold)
  const count = grounded.length
  let bestStart = 0
  let bestLength = 0
  let runStart = 0
  let runLength = 0

  for (let index = 0; index < count * 2; index += 1) {
    if (grounded[index % count]) {
      if (runLength === 0) runStart = index
      runLength += 1
      if (runLength > bestLength) {
        bestLength = runLength
        bestStart = runStart
      }
      continue
    }
    runLength = 0
  }

  const length = Math.min(bestLength, count)
  return [
    Number(((bestStart % count) / count).toFixed(3)),
    Number((((bestStart + length) % count) / count).toFixed(3)),
  ]
}

function hipsTravel(frames) {
  const first = frames[0].hips
  const last = frames[frames.length - 1].hips
  return Math.hypot(last.x - first.x, last.z - first.z) / CENTIMETRES_PER_METRE
}

async function measure(file) {
  const name = basename(file, extname(file))
  const gltf = await loadGlb(join(CLIP_DIRECTORY, file))
  if (gltf.animations.length !== 1) throw new Error(`${file} holds ${gltf.animations.length} clips, expected one`)

  const clip = gltf.animations[0]
  const frames = sampleClip(gltf.scene, clip)
  const impliedSpeed = median([...stanceSpeeds(frames, 'left'), ...stanceSpeeds(frames, 'right')])
  const travel = hipsTravel(frames)

  return {
    contactShare: Number(((contactShare(frames, 'left') + contactShare(frames, 'right')) / 2).toFixed(3)),
    stanceWindows: { left: stanceWindow(frames, 'left'), right: stanceWindow(frames, 'right') },
    duration: Number(clip.duration.toFixed(3)),
    impliedSpeed: Number(impliedSpeed.toFixed(3)),
    name,
    rootSpeed: Number((travel / clip.duration).toFixed(3)),
    strideLength: Number((impliedSpeed * clip.duration).toFixed(3)),
  }
}

const files = readdirSync(CLIP_DIRECTORY).filter((file) => extname(file).toLowerCase() === '.glb')
if (files.length === 0) throw new Error(`no GLB clips in ${CLIP_DIRECTORY}`)

const metrics = []
for (const file of files) metrics.push(await measure(file))
metrics.sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(METRICS_FILE, `${JSON.stringify(metrics, null, 2)}\n`)

const widest = Math.max(...metrics.map((entry) => entry.name.length))
console.log(`${'clip'.padEnd(widest)}  seconds  root m/s  implied m/s  stride m  contact  stance L        stance R`)
for (const entry of metrics) {
  console.log([
    entry.name.padEnd(widest),
    String(entry.duration).padStart(7),
    String(entry.rootSpeed).padStart(8),
    String(entry.impliedSpeed).padStart(11),
    String(entry.strideLength).padStart(8),
    String(entry.contactShare).padStart(7),
    `${entry.stanceWindows.left[0]}..${entry.stanceWindows.left[1]}`.padStart(13),
    `${entry.stanceWindows.right[0]}..${entry.stanceWindows.right[1]}`.padStart(13),
  ].join('  '))
}
