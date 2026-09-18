/* @important Measures the stance a clip actually puts the body in, in the body's
   own frame, so a pose can be judged by numbers instead of by eye.

     node scripts/measure-stance.mjs                 # the converted clips
     node scripts/measure-stance.mjs --source        # the FBX sources instead
     node scripts/measure-stance.mjs idle.glb        # one of them

   Per clip it prints, averaged over the cycle and at its worst frame:

     width      distance between the ankles across the body
     under hip  how far each ankle sits inboard (negative) or outboard of its
                own hip, which is what reads as knock-knees when it goes wrong
     toe out    the angle each foot points away from the body's own forward,
                taken as the median over the frames where the foot is flat;
                negative is pigeon-toed. Frames at toe-off are left out because
                the ankle-to-toe line then points nearly straight down and its
                horizontal part is noise — reading an angle off it once answered
                174 degrees.

   A walk cycle swings the feet past each other, so width alone means nothing on
   a moving clip; the standing clip is where these numbers have to be right, and
   it is the one nobody checks because no foot ever leaves the ground in it. */
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
const { AnimationMixer, Quaternion, Vector3 } = await import('three')

const UP = new Vector3(0, 1, 0)

const SOURCES = resolve('wip/animations')
const CONVERTED = resolve('src/features/motion/assets/animations')
const SAMPLES = 48
const FLAT_FOOT_SHARE = 0.75
const BONES = {
  hips: /Hips$/,
  hipsLeft: /LeftUpLeg$/,
  hipsRight: /RightUpLeg$/,
  ankleLeft: /LeftFoot$/,
  ankleRight: /RightFoot$/,
  toeLeft: /LeftToe(Base)?$/,
  toeRight: /RightToe(Base)?$/,
}

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

async function parseClip(file) {
  return file.toLowerCase().endsWith('.glb') ? await parseGlb(file) : parseFbx(file)
}

function boneMap(root) {
  const found = {}
  root.traverse((node) => {
    for (const [key, pattern] of Object.entries(BONES)) {
      if (!found[key] && pattern.test(node.name)) found[key] = node
    }
  })
  return found
}

function worldOf(bone, into) {
  bone.getWorldPosition(into)
  return into
}

function degrees(radians) {
  return (radians * 180) / Math.PI
}

function toeOut(bones, side, ankle, forward, scratch) {
  const toe = bones[`toe${side}`]
  if (!toe) return null
  const along = worldOf(toe, scratch.e).clone().sub(ankle)
  const flat = along.clone().setY(0)
  if (flat.length() < FLAT_FOOT_SHARE * along.length()) return null
  flat.normalize()
  const across = new Vector3().crossVectors(UP, forward)
  const angle = Math.atan2(flat.dot(across), flat.dot(forward))
  return side === 'Left' ? degrees(angle) : -degrees(angle)
}

function sampleStance(bones, scratch) {
  const ankleLeft = worldOf(bones.ankleLeft, scratch.a)
  const ankleRight = worldOf(bones.ankleRight, scratch.b)
  const hipLeft = worldOf(bones.hipsLeft, scratch.c)
  const hipRight = worldOf(bones.hipsRight, scratch.d)
  const width = Math.abs(ankleLeft.x - ankleRight.x)
  const hipWidth = Math.abs(hipLeft.x - hipRight.x)
  const leftUnderHip = Math.sign(hipLeft.x) * (ankleLeft.x - hipLeft.x)
  const rightUnderHip = Math.sign(hipRight.x) * (ankleRight.x - hipRight.x)
  const forward = new Vector3(0, 0, 1)
    .applyQuaternion(bones.hips.getWorldQuaternion(new Quaternion()))
    .setY(0)
    .normalize()
  return {
    hipWidth,
    leftUnderHip,
    rightUnderHip,
    toeOutLeft: toeOut(bones, 'Left', ankleLeft, forward, scratch),
    toeOutRight: toeOut(bones, 'Right', ankleRight, forward, scratch),
    width,
  }
}

async function measureClip(directory, file) {
  const scene = await parseClip(resolve(directory, file))
  const clip = scene.animations[0]
  if (!clip) return null
  const bones = boneMap(scene)
  if (!bones.ankleLeft || !bones.ankleRight || !bones.hipsLeft) return null
  const mixer = new AnimationMixer(scene)
  const action = mixer.clipAction(clip)
  action.play()
  const scratch = { a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(), e: new Vector3() }

  const samples = []
  for (let index = 0; index < SAMPLES; index += 1) {
    action.time = (index / SAMPLES) * clip.duration
    mixer.update(0)
    scene.updateMatrixWorld(true)
    samples.push(sampleStance(bones, scratch))
  }
  const mean = (pick) => samples.reduce((sum, sample) => sum + pick(sample), 0) / samples.length
  const medianOf = (pick) => {
    const values = samples.map(pick).filter((value) => value !== null).sort((left, right) => left - right)
    if (values.length === 0) return 0
    const middle = Math.floor(values.length / 2)
    return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2
  }
  const worst = (pick) => samples.reduce((found, sample) => (Math.abs(pick(sample)) > Math.abs(found) ? pick(sample) : found), 0)
  return {
    duration: clip.duration,
    hipWidth: mean((sample) => sample.hipWidth),
    meanWidth: mean((sample) => sample.width),
    underHipLeft: mean((sample) => sample.leftUnderHip),
    underHipRight: mean((sample) => sample.rightUnderHip),
    toeOutLeft: medianOf((sample) => sample.toeOutLeft),
    toeOutRight: medianOf((sample) => sample.toeOutRight),
    worstUnderHip: worst((sample) => Math.min(sample.leftUnderHip, sample.rightUnderHip)),
  }
}

const wantsSources = process.argv.includes('--source')
const requested = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
const directory = wantsSources ? SOURCES : CONVERTED
const extension = wantsSources ? '.fbx' : '.glb'
const files = requested
  ? [requested]
  : readdirSync(directory).filter((file) => file.toLowerCase().endsWith(extension))

console.log('clip                       hips  ankles  under hip L/R    toe out L/R   worst under hip')
for (const file of files) {
  const measured = await measureClip(directory, file)
  if (!measured) {
    console.log(`${file.padEnd(26)} no animation or no leg bones`)
    continue
  }
  const number = (value, digits = 1) => value.toFixed(digits).padStart(6)
  console.log(
    file.padEnd(26),
    number(measured.hipWidth),
    number(measured.meanWidth),
    `${number(measured.underHipLeft)} ${number(measured.underHipRight)}`,
    ` ${number(measured.toeOutLeft)} ${number(measured.toeOutRight)}`,
    number(measured.worstUnderHip),
  )
}
