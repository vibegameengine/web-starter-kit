/* @important Says whether a locomotion clip is clean enough to build a system
   on, by measuring it rather than by looking at it.

     node scripts/verify-clips.mjs              # the converted clips
     node scripts/verify-clips.mjs --source     # the FBX sources instead

   Mixamo clips are captures, not game assets. They drift across their own
   direction of travel, they float up and down, they end facing a few degrees
   off where they started, their first and last frames do not meet, and their
   stance is whatever the actor was doing that day. Every one of those defects
   survives a perfect runtime: the body is driven by the capsule and the phase
   by distance travelled, so a clip that wanders sideways drags the character
   sideways, and a cycle whose ends do not meet pops once per stride for ever.

   Two things this file learned the hard way, both of which made earlier versions
   of these checks meaningless:

   The travel axis is the CLIP's, not the body's forward. A strafe clip travels
   sideways on purpose; measuring its drift against the body's forward calls
   76 cm of deliberate travel a defect.

   The loop seam has to be read from the raw keyframes. Asking the mixer for the
   pose at t = duration wraps round to t = 0, so comparing those two poses
   compares a frame with itself and prints a perfect zero for every clip, clean
   or filthy.

   Numbers are in centimetres and degrees, in the clip's own units. */
import { readdirSync, readFileSync } from 'node:fs'
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
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
const { AnimationMixer, Euler, Quaternion, Vector3 } = await import('three')

const SOURCES = resolve('wip/animations')
const CONVERTED = resolve('src/features/motion/assets/animations')
const SAMPLES = 64

const MAX_DRIFT_ACROSS_CM = 2
const MAX_VERTICAL_DRIFT_CM = 1.5
const MAX_YAW_DRIFT_DEGREES = 2
const MAX_LOOP_SEAM_DEGREES = 6
const MAX_TOE_OUT_DEGREES = 9
const MAX_FOOT_FLOOR_SPREAD_CM = 2
const MAX_STANCE_SHARE_GAP = 0.08
const MAX_STEP_LENGTH_GAP_CM = 6
const MAX_FOOTFALL_OFFSET_GAP_CM = 4
const IN_PLACE_TRAVEL_CM = 5
const FLAT_FOOT_SHARE = 0.75

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const degrees = (radians) => (radians * 180) / Math.PI

function parseFbx(file) {
  const buffer = readFileSync(file)
  return new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
}

async function parseGlb(file) {
  const buffer = readFileSync(file)
  const loaded = await new GLTFLoader().parseAsync(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    '',
  )
  const scene = loaded.scene
  scene.animations = loaded.animations
  return scene
}

function boneMap(root) {
  const wanted = {
    ankleLeft: /LeftFoot$/,
    ankleRight: /RightFoot$/,
    hips: /Hips$/,
    toeLeft: /LeftToe(Base)?$/,
    toeRight: /RightToe(Base)?$/,
  }
  const found = {}
  root.traverse((node) => {
    for (const [key, pattern] of Object.entries(wanted)) {
      if (!found[key] && pattern.test(node.name)) found[key] = node
    }
  })
  return found
}

function toeOutOf(ankle, toe, forward) {
  const along = toe.clone().sub(ankle)
  const flat = along.clone().setY(0)
  if (flat.length() < FLAT_FOOT_SHARE * along.length()) return null
  flat.normalize()
  const across = new Vector3().crossVectors(new Vector3(0, 1, 0), forward)
  return degrees(Math.atan2(flat.dot(across), flat.dot(forward)))
}

function medianOf(values) {
  const sorted = values.filter((value) => value !== null).sort((left, right) => left - right)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function seamOf(clip) {
  let worst = { bone: 'none', degrees: 0 }
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.quaternion') || track.times.length < 2) continue
    const last = track.times.length - 1
    const first = new Quaternion(track.values[0], track.values[1], track.values[2], track.values[3])
    const final = new Quaternion(
      track.values[last * 4],
      track.values[last * 4 + 1],
      track.values[last * 4 + 2],
      track.values[last * 4 + 3],
    )
    const between = degrees(2 * Math.acos(Math.min(1, Math.abs(first.dot(final)))))
    if (between > worst.degrees) worst = { bone: track.name.replace('.quaternion', ''), degrees: between }
  }
  return worst
}

async function sampleClip(file, directory) {
  const scene = file.endsWith('.glb') ? await parseGlb(resolve(directory, file)) : parseFbx(resolve(directory, file))
  const clip = scene.animations[0]
  if (!clip) return null
  const bones = boneMap(scene)
  const mixer = new AnimationMixer(scene)
  const action = mixer.clipAction(clip)
  action.play()

  const frames = []
  for (let index = 0; index <= SAMPLES; index += 1) {
    action.time = (index / SAMPLES) * clip.duration * (index === SAMPLES ? 0.999 : 1)
    mixer.update(0)
    scene.updateMatrixWorld(true)
    const rotation = bones.hips.getWorldQuaternion(new Quaternion())
    const forward = new Vector3(0, 0, 1).applyQuaternion(rotation).setY(0).normalize()
    const ankleLeft = bones.ankleLeft.getWorldPosition(new Vector3())
    const ankleRight = bones.ankleRight.getWorldPosition(new Vector3())
    frames.push({
      ankleLeft,
      ankleRight,
      facing: new Euler().setFromQuaternion(rotation, 'YXZ').y,
      hips: bones.hips.getWorldPosition(new Vector3()),
      toeOutLeft: bones.toeLeft ? toeOutOf(ankleLeft, bones.toeLeft.getWorldPosition(new Vector3()), forward) : null,
      toeOutRight: bones.toeRight
        ? -toeOutOf(ankleRight, bones.toeRight.getWorldPosition(new Vector3()), forward)
        : null,
    })
  }
  return { clip, frames }
}

function travelAxisOf(frames) {
  const travel = new Vector3().subVectors(frames[frames.length - 1].hips, frames[0].hips).setY(0)
  if (travel.length() < IN_PLACE_TRAVEL_CM) return null
  return travel.normalize()
}

function checkDrift(name, frames) {
  const travelled = new Vector3().subVectors(frames[frames.length - 1].hips, frames[0].hips)
  const axis = travelAxisOf(frames)
  const across = axis
    ? Math.abs(new Vector3().crossVectors(new Vector3(0, 1, 0), axis).dot(travelled))
    : Math.hypot(travelled.x, travelled.z)
  check(
    `${name}: the hips hold their line`,
    across <= MAX_DRIFT_ACROSS_CM,
    axis
      ? `${across.toFixed(2)} cm across ${travelled.length().toFixed(1)} cm of travel`
      : `${across.toFixed(2)} cm of wander in a clip that stays put`,
  )
  check(
    `${name}: the hips end at the height they started`,
    Math.abs(travelled.y) <= MAX_VERTICAL_DRIFT_CM,
    `${travelled.y.toFixed(2)} cm`,
  )
  const turned = frames[frames.length - 1].facing - frames[0].facing
  const yawDrift = degrees(Math.atan2(Math.sin(turned), Math.cos(turned)))
  check(
    `${name}: the body does not turn over the cycle`,
    Math.abs(yawDrift) <= MAX_YAW_DRIFT_DEGREES,
    `${yawDrift.toFixed(2)} degrees`,
  )
}

function checkSeam(name, clip) {
  const seam = seamOf(clip)
  check(
    `${name}: the cycle meets itself`,
    seam.degrees <= MAX_LOOP_SEAM_DEGREES,
    `${seam.bone} is ${seam.degrees.toFixed(2)} degrees apart end to end`,
  )
}

function checkStance(name, frames) {
  const toeLeft = medianOf(frames.map((frame) => frame.toeOutLeft)) ?? 0
  const toeRight = medianOf(frames.map((frame) => frame.toeOutRight)) ?? 0
  check(
    `${name}: the toes point where the body does`,
    Math.abs(toeLeft) <= MAX_TOE_OUT_DEGREES && Math.abs(toeRight) <= MAX_TOE_OUT_DEGREES,
    `left ${toeLeft.toFixed(1)}, right ${toeRight.toFixed(1)} degrees`,
  )
  const lowestLeft = Math.min(...frames.map((frame) => frame.ankleLeft.y))
  const lowestRight = Math.min(...frames.map((frame) => frame.ankleRight.y))
  check(
    `${name}: both feet reach the same floor`,
    Math.abs(lowestLeft - lowestRight) <= MAX_FOOT_FLOOR_SPREAD_CM,
    `left ${lowestLeft.toFixed(2)}, right ${lowestRight.toFixed(2)} cm`,
  )
}

/* @important A gait is symmetric or it limps. Mixamo captures are one actor's
   two legs, and they are never quite equal: the stance windows differ, one step
   is longer than the other, and one foot falls further from the centre line.
   None of that shows up in a drift or seam measurement, and all of it is
   visible as soon as the character walks. */
function gaitOf(frames, side) {
  const ankles = frames.map((frame) => (side === 'left' ? frame.ankleLeft : frame.ankleRight))
  const lowest = Math.min(...ankles.map((ankle) => ankle.y))
  const planted = ankles.map((ankle) => ankle.y <= lowest + MAX_FOOT_FLOOR_SPREAD_CM)
  const share = planted.filter(Boolean).length / planted.length
  const travelAxis = travelAxisOf(frames)
  const axis = travelAxis ?? new Vector3(0, 0, 1)
  const along = ankles.map((ankle) => ankle.dot(axis))
  const across = ankles.map((ankle) => ankle.dot(new Vector3().crossVectors(new Vector3(0, 1, 0), axis)))
  const hips = frames.map((frame) => frame.hips.dot(new Vector3().crossVectors(new Vector3(0, 1, 0), axis)))
  return {
    footfall: medianOf(across.map((value, index) => value - hips[index])),
    share,
    swing: Math.max(...along) - Math.min(...along),
  }
}

function checkGait(name, frames) {
  const left = gaitOf(frames, 'left')
  const right = gaitOf(frames, 'right')
  check(
    `${name}: both legs carry the same share of the cycle`,
    Math.abs(left.share - right.share) <= MAX_STANCE_SHARE_GAP,
    `left ${(left.share * 100).toFixed(0)}%, right ${(right.share * 100).toFixed(0)}% of the cycle on the ground`,
  )
  check(
    `${name}: both legs swing the same distance`,
    Math.abs(left.swing - right.swing) <= MAX_STEP_LENGTH_GAP_CM,
    `left ${left.swing.toFixed(1)} cm, right ${right.swing.toFixed(1)} cm`,
  )
  check(
    `${name}: both feet fall the same distance from the centre line`,
    Math.abs(Math.abs(left.footfall ?? 0) - Math.abs(right.footfall ?? 0)) <= MAX_FOOTFALL_OFFSET_GAP_CM,
    `left ${(left.footfall ?? 0).toFixed(1)} cm, right ${(right.footfall ?? 0).toFixed(1)} cm from the hips`,
  )
}

const wantsSources = process.argv.includes('--source')
const directory = wantsSources ? SOURCES : CONVERTED
const extension = wantsSources ? '.fbx' : '.glb'
const files = readdirSync(directory).filter((file) => file.toLowerCase().endsWith(extension))

for (const file of files) {
  const sampled = await sampleClip(file, directory)
  if (!sampled) {
    console.log(`\n${file} — no animation`)
    continue
  }
  console.log(`\n${file} — ${sampled.clip.duration.toFixed(3)} s`)
  checkDrift(file, sampled.frames)
  checkSeam(file, sampled.clip)
  checkStance(file, sampled.frames)
  checkGait(file, sampled.frames)
}

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
