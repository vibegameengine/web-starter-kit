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

const SOURCE_DIRECTORY = resolve('wip/animations')
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
  const glb = await exportGlb(group)
  writeFileSync(join(TARGET_DIRECTORY, `${name}.glb`), Buffer.from(glb))

  return {
    bytes: glb.byteLength,
    duration: Number(clip.duration.toFixed(3)),
    name,
    speed: Number((travelCentimetres / 100 / clip.duration).toFixed(3)),
    travel: Number((travelCentimetres / 100).toFixed(3)),
  }
}

const sources = readdirSync(SOURCE_DIRECTORY).filter((file) => extname(file).toLowerCase() === '.fbx')
if (sources.length === 0) throw new Error(`no FBX clips in ${SOURCE_DIRECTORY}`)
mkdirSync(TARGET_DIRECTORY, { recursive: true })

const report = []
for (const file of sources) report.push(await convert(file))

const widest = Math.max(...report.map((entry) => entry.name.length))
console.log(`${'clip'.padEnd(widest)}  seconds  travel m  m/s     KB`)
for (const entry of report.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log([
    entry.name.padEnd(widest),
    String(entry.duration).padStart(7),
    String(entry.travel).padStart(8),
    String(entry.speed).padStart(6),
    String(Math.round(entry.bytes / 1024)).padStart(5),
  ].join('  '))
}
