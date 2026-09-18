import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      if (this.onloadend) this.onloadend()
    })
  }
}

const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
const { AnimationMixer, Quaternion, Vector3 } = await import('three')

const SOURCE_DIRECTORY = resolve('wip/animations')
const MAX_TOE_OUT_DEGREES = 8
const FLAT_FOOT_SHARE = 0.75
const UP = new Vector3(0, 1, 0)
const FOOT_BONES = [
  { ankle: /LeftFoot$/, thigh: /LeftUpLeg$/, toe: /LeftToe(Base)?$/ },
  { ankle: /RightFoot$/, thigh: /RightUpLeg$/, toe: /RightToe(Base)?$/ },
]
const STILL_FOOT_SPREAD = 4
const LEVEL_STANCE_TOLERANCE = 2
const TARGET_DIRECTORY = resolve('src/features/motion/assets/animations')
const HIPS_POSITION_TRACK = /Hips\.position$/

function kebabName(fileName) {
  return basename(fileName, extname(fileName))
    .replace(/[()]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

function parseFbx(file) {
  const buffer = readFileSync(file)
  const loader = new FBXLoader()
  return loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
}

function hipsTravel(clip) {
  const track = clip.tracks.find((candidate) => HIPS_POSITION_TRACK.test(candidate.name))
  if (!track) throw new Error(`no hips position track in ${clip.name}`)
  const last = track.values.length - 3
  const dx = track.values[last] - track.values[0]
  const dz = track.values[last + 2] - track.values[0 + 2]
  return Math.hypot(dx, dz)
}

function boneMatching(root, pattern) {
  let found = null
  root.traverse((node) => {
    if (!found && pattern.test(node.name)) found = node
  })
  return found
}

function toeOutRadians(ankle, toe, forward) {
  const along = toe.clone().sub(ankle)
  const flat = along.clone().setY(0)
  if (flat.length() < FLAT_FOOT_SHARE * along.length()) return null
  flat.normalize()
  const side = new Vector3().crossVectors(UP, forward)
  return Math.atan2(flat.dot(side), flat.dot(forward))
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return 0
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/* @important Mixamo stands and walks with the toes turned out — measured 15 and
   28 degrees on the two feet of the idle, asymmetrically. On a mannequin with
   thick legs that reads as a broken stance, and no amount of procedural foot
   placement fixes it, because the clip is where it comes from.

   The angle is only meaningful while the foot is flat: at toe-off the ankle-to-toe
   line points almost straight down, its horizontal part is a few millimetres of
   noise, and reading an angle off it once answered 174 degrees and turned the
   whole clip inside out. So the correction is one constant per foot — the median
   over the flat-footed frames, brought inside MAX_TOE_OUT_DEGREES — applied to
   every key of that foot. A constant cannot introduce a discontinuity, and it
   moves nothing but the foot's own yaw: the ankle stays where the clip put it. */
function neutralizeToeOut(group, clip) {
  const mixer = new AnimationMixer(group)
  const action = mixer.clipAction(clip)
  action.play()
  const limit = (MAX_TOE_OUT_DEGREES * Math.PI) / 180
  const measured = []

  for (const side of FOOT_BONES) {
    const ankle = boneMatching(group, side.ankle)
    const toe = boneMatching(group, side.toe)
    const hips = boneMatching(group, /Hips$/)
    if (!ankle || !toe || !hips) continue
    const track = clip.tracks.find((candidate) => candidate.name === `${ankle.name}.quaternion`)
    if (!track) continue

    const angles = []
    const forward = new Vector3()
    const ankleWorld = new Vector3()
    const toeWorld = new Vector3()
    for (const time of track.times) {
      action.time = time
      mixer.update(0)
      group.updateMatrixWorld(true)
      forward.set(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(new Quaternion())).setY(0).normalize()
      const angle = toeOutRadians(ankle.getWorldPosition(ankleWorld), toe.getWorldPosition(toeWorld), forward)
      if (angle !== null) angles.push(angle)
    }
    if (angles.length === 0) continue

    const sign = /Left/.test(ankle.name) ? 1 : -1
    const middle = median(angles)
    const wanted = Math.max(-limit, Math.min(limit, sign * middle)) * sign
    measured.push({ bone: ankle.name, degrees: (sign * middle * 180) / Math.PI })
    if (Math.abs(middle - wanted) < 1e-4) continue

    action.time = track.times[0]
    mixer.update(0)
    group.updateMatrixWorld(true)
    const parentWorld = ankle.parent.getWorldQuaternion(new Quaternion())
    const correction = new Quaternion().setFromAxisAngle(UP, wanted - middle)
    const inParent = parentWorld.clone().invert().multiply(correction).multiply(parentWorld)
    const local = new Quaternion()
    for (let key = 0; key < track.times.length; key += 1) {
      local.set(track.values[key * 4], track.values[key * 4 + 1], track.values[key * 4 + 2], track.values[key * 4 + 3])
      local.premultiply(inParent)
      track.values[key * 4] = local.x
      track.values[key * 4 + 1] = local.y
      track.values[key * 4 + 2] = local.z
      track.values[key * 4 + 3] = local.w
    }
  }
  action.stop()
  mixer.uncacheClip(clip)
  return measured
}

/* @important The idle also stands with its left foot nine centimetres outboard
   of its own hip while the right sits under it, which is what reads as a lopsided,
   collapsing stance on a still character. Rolling the thigh about the body's
   forward axis walks the ankle sideways without touching how the leg bends, so a
   single constant per leg brings each ankle under its hip. Only clips whose feet
   barely move qualify: in a walk the ankle is SUPPOSED to swing far outboard and
   inboard of its hip, and levelling that would flatten the gait. */
function levelStance(group, clip) {
  const hips = boneMatching(group, /Hips$/)
  if (!hips) return []
  const mixer = new AnimationMixer(group)
  const action = mixer.clipAction(clip)
  action.play()
  const corrected = []

  for (const side of FOOT_BONES) {
    const ankle = boneMatching(group, side.ankle)
    const thigh = boneMatching(group, side.thigh)
    if (!ankle || !thigh) continue
    const track = clip.tracks.find((candidate) => candidate.name === `${thigh.name}.quaternion`)
    if (!track) continue

    const offsets = []
    const legLengths = []
    const ankleWorld = new Vector3()
    const hipWorld = new Vector3()
    for (const time of track.times) {
      action.time = time
      mixer.update(0)
      group.updateMatrixWorld(true)
      thigh.getWorldPosition(hipWorld)
      ankle.getWorldPosition(ankleWorld)
      const across = new Vector3()
        .crossVectors(UP, new Vector3(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(new Quaternion())).setY(0).normalize())
      offsets.push(ankleWorld.clone().sub(hipWorld).dot(across))
      legLengths.push(Math.max(1, hipWorld.y - ankleWorld.y))
    }
    if (offsets.length === 0) continue

    const spread = Math.max(...offsets) - Math.min(...offsets)
    const middle = median(offsets)
    if (spread > STILL_FOOT_SPREAD || Math.abs(middle) < LEVEL_STANCE_TOLERANCE) continue

    const wanted = Math.sign(middle) * LEVEL_STANCE_TOLERANCE
    const legLength = median(legLengths)
    const angle = Math.atan2(middle - wanted, legLength)
    corrected.push({ bone: thigh.name, centimetres: middle })

    action.time = track.times[0]
    mixer.update(0)
    group.updateMatrixWorld(true)
    const forward = new Vector3(0, 0, 1)
      .applyQuaternion(hips.getWorldQuaternion(new Quaternion()))
      .setY(0)
      .normalize()
    const parentWorld = thigh.parent.getWorldQuaternion(new Quaternion())
    const correction = new Quaternion().setFromAxisAngle(forward, -angle)
    const inParent = parentWorld.clone().invert().multiply(correction).multiply(parentWorld)
    const local = new Quaternion()
    for (let key = 0; key < track.times.length; key += 1) {
      local.set(track.values[key * 4], track.values[key * 4 + 1], track.values[key * 4 + 2], track.values[key * 4 + 3])
      local.premultiply(inParent)
      track.values[key * 4] = local.x
      track.values[key * 4 + 1] = local.y
      track.values[key * 4 + 2] = local.z
      track.values[key * 4 + 3] = local.w
    }
  }
  action.stop()
  mixer.uncacheClip(clip)
  return corrected
}

async function exportGlb(group) {
  const exporter = new GLTFExporter()
  return await new Promise((done, failed) => {
    exporter.parse(group, done, failed, { animations: group.animations, binary: true })
  })
}

async function convert(file) {
  const name = kebabName(file)
  const group = parseFbx(join(SOURCE_DIRECTORY, file))
  if (group.animations.length !== 1) {
    throw new Error(`${file} holds ${group.animations.length} clips, expected exactly one`)
  }

  const clip = group.animations[0]
  clip.name = name
  const travelCentimetres = hipsTravel(clip)
  const measuredToeOut = neutralizeToeOut(group, clip)
  const levelled = levelStance(group, clip)
  const glb = await exportGlb(group)
  writeFileSync(join(TARGET_DIRECTORY, `${name}.glb`), Buffer.from(glb))

  return {
    bytes: glb.byteLength,
    duration: Number(clip.duration.toFixed(3)),
    name,
    speed: Number((travelCentimetres / 100 / clip.duration).toFixed(3)),
    levelled: levelled.map((entry) => `${/Left/.test(entry.bone) ? 'L' : 'R'}${entry.centimetres.toFixed(0)}`).join('/') || '-',
    toeOut: measuredToeOut.map((entry) => `${/Left/.test(entry.bone) ? 'L' : 'R'}${entry.degrees.toFixed(0)}`).join('/'),
    travel: Number((travelCentimetres / 100).toFixed(3)),
  }
}

const sources = readdirSync(SOURCE_DIRECTORY).filter((file) => extname(file).toLowerCase() === '.fbx')
if (sources.length === 0) throw new Error(`no FBX clips in ${SOURCE_DIRECTORY}`)
mkdirSync(TARGET_DIRECTORY, { recursive: true })

const report = []
for (const file of sources) report.push(await convert(file))

const widest = Math.max(...report.map((entry) => entry.name.length))
console.log(`${'clip'.padEnd(widest)}  seconds  travel m  m/s     KB  toe out  levelled`)
for (const entry of report.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log([
    entry.name.padEnd(widest),
    String(entry.duration).padStart(7),
    String(entry.travel).padStart(8),
    String(entry.speed).padStart(6),
    String(Math.round(entry.bytes / 1024)).padStart(5),
    String(entry.toeOut).padStart(9),
    String(entry.levelled).padStart(8),
  ].join('  '))
}
