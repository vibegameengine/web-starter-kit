import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BLENDER = process.env.BLENDER_PATH
  ?? 'C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe'
const BAKE_SCRIPT = resolve('scripts/blender-bake-root-motion.py')
const SOURCE_DIRECTORY = resolve('wip/animations')
const ROOTED_DIRECTORY = resolve('wip/rooted')
const SPEEDS_FILE = resolve('src/features/motion/assets/animations/clipGroundSpeeds.json')

const CLIPS = [
  { clip: 'walk-forward', source: 'Walking.fbx' },
  { clip: 'walk-backward', source: 'Walking Backwards.fbx' },
  { clip: 'walk-strafe-right', source: 'Walk Strafe Right.fbx' },
  { clip: 'run-forward', source: 'Running.fbx' },
  { clip: 'run-backward', source: 'Running Backward.fbx' },
]

if (!existsSync(BLENDER)) {
  throw new Error(`no Blender at ${BLENDER} — set BLENDER_PATH to its executable`)
}
mkdirSync(ROOTED_DIRECTORY, { recursive: true })

function bake(entry) {
  const target = join(ROOTED_DIRECTORY, `${entry.clip}.glb`)
  const output = execFileSync(BLENDER, [
    '-b',
    '-P',
    BAKE_SCRIPT,
    '--',
    join(SOURCE_DIRECTORY, entry.source),
    target,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

  const line = output.split(/\r?\n/).find((candidate) => candidate.startsWith('BAKE_REPORT '))
  if (!line) throw new Error(`${entry.source} produced no bake report:\n${output.slice(-400)}`)
  const report = JSON.parse(line.slice('BAKE_REPORT '.length))
  const settled = report.residualsAlongForward.at(-1)
  if (Math.abs(settled) > 0.02) {
    throw new Error(`${entry.clip} never settled: stance foot still slides ${settled} m/s`)
  }
  if (report.speed <= 0) {
    throw new Error(`${entry.clip} measured a non-positive ground speed of ${report.speed} m/s`)
  }
  return {
    baked: report.baked !== false,
    clip: entry.clip,
    groundSpeed: report.speed,
    residual: settled,
    source: entry.source,
  }
}

const measured = CLIPS.map(bake)
writeFileSync(SPEEDS_FILE, `${JSON.stringify(measured, null, 2)}\n`)

const widest = Math.max(...measured.map((entry) => entry.clip.length))
console.log(`${'clip'.padEnd(widest)}  ground m/s  slip left  source`)
for (const entry of measured) {
  console.log([
    entry.clip.padEnd(widest),
    entry.groundSpeed.toFixed(3).padStart(10),
    entry.residual.toFixed(4).padStart(9),
    entry.baked ? 'baked' : 'already travels',
  ].join('  '))
}
