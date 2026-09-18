/* @important Catches one leg walking into the other.

     npm run dev
     npm run verify:crossing        # or: node scripts/verify-crossing.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

   Read straight off the skeleton in the scene, never from the foot pass's own
   debug readout, so a pass that reports the wrong thing cannot pass itself. The
   body's side axis is the line between the two hip joints, not a facing
   convention: a sign slip in a convention is exactly the kind of defect that
   puts a foot on the wrong side.

   For every frame the two ankles and the two knees are projected on that side
   axis, whenever the two are side by side fore and aft — two feet a stride
   apart may share a line, two feet next to each other may not. Two things are
   asked of them: the left one never ends up right of the right one, and the
   passes never bring them closer than the clips themselves ever do in that
   gait. The margin is measured, not typed: the same course is walked with the
   procedural passes off, and its narrowest gap is the floor. */
import { chromium } from 'playwright'

import { resetStand, stepStand } from './lib/motionStand.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5173'

const SIDE_BY_SIDE_METERS = 0.25
const NARROWING_TOLERANCE_METERS = 0.01
const WARMUP_FRAMES = 6

const COURSE = [
  { drive: 'forward', frames: 50 },
  { drive: 'strafe', frames: 50 },
  { drive: 'backward', frames: 50 },
  { drive: 'diagonal', frames: 50 },
  { drive: 'still', frames: 30 },
  { drive: 'strafe', frames: 40 },
  { drive: 'forward', frames: 40 },
  { drive: 'still', frames: 30 },
]

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 200)))

await page.goto(`${BASE}/labs/motion-stand`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => typeof window.__motionFeet === 'function', null, { timeout: 30000 })
await page.getByTestId('motion-stand-course-flat').click()
await page.waitForFunction(() => typeof window.__motionFeet === 'function', null, { timeout: 30000 })

const readFrame = () => page.evaluate(() => {
  const bones = {}
  const wanted = { leftFoot: /LeftFoot$/, leftKnee: /LeftLeg$/, leftThigh: /LeftUpLeg$/, rightFoot: /RightFoot$/, rightKnee: /RightLeg$/, rightThigh: /RightUpLeg$/ }
  window.__labScene.traverse((node) => {
    for (const [key, pattern] of Object.entries(wanted)) {
      if (!bones[key] && pattern.test(node.name)) bones[key] = node
    }
  })
  const out = {}
  for (const [key, bone] of Object.entries(bones)) {
    const world = bone.getWorldPosition(new (Object.getPrototypeOf(bone.position).constructor)())
    out[key] = [world.x, world.y, world.z]
  }
  return out
})

function gapsOf(frame) {
  const sideX = frame.leftThigh[0] - frame.rightThigh[0]
  const sideZ = frame.leftThigh[2] - frame.rightThigh[2]
  const length = Math.hypot(sideX, sideZ) || 1
  const side = [sideX / length, sideZ / length]
  const fore = [-side[1], side[0]]
  const project = (left, right, axis) => (left[0] - right[0]) * axis[0] + (left[2] - right[2]) * axis[1]
  return {
    ankle: project(frame.leftFoot, frame.rightFoot, side),
    ankleFore: Math.abs(project(frame.leftFoot, frame.rightFoot, fore)),
    knee: project(frame.leftKnee, frame.rightKnee, side),
    kneeFore: Math.abs(project(frame.leftKnee, frame.rightKnee, fore)),
  }
}

let sprinting = false
let passesOn = true

async function setPasses(wanted) {
  if (passesOn === wanted) return
  await page.getByTestId('motion-stand-pass-feet').click()
  passesOn = wanted
}

async function walkCourse(sprint) {
  await resetStand(page)
  if (sprint !== sprinting) {
    await page.getByTestId('motion-stand-sprint').click()
    sprinting = sprint
  }
  const frames = []
  for (const [index, leg] of COURSE.entries()) {
    await page.getByTestId(`motion-stand-drive-${leg.drive}`).click()
    const count = index === 0 ? leg.frames + WARMUP_FRAMES : leg.frames
    for (let frame = 0; frame < count; frame += 1) {
      await stepStand(page)
      if (index === 0 && frame < WARMUP_FRAMES) continue
      frames.push({ drive: leg.drive, ...gapsOf(await readFrame()) })
    }
  }
  return frames
}

function narrowest(frames, part) {
  return frames.reduce((low, frame) => (frame[`${part}Fore`] < SIDE_BY_SIDE_METERS ? Math.min(low, frame[part]) : low), Infinity)
}

function offenders(frames, part, below) {
  return frames
    .map((frame, index) => ({ drive: frame.drive, fore: frame[`${part}Fore`], gap: frame[part], index }))
    .filter((entry) => entry.fore < SIDE_BY_SIDE_METERS && entry.gap < below)
    .slice(0, 12)
    .map((entry) => `f${entry.index}/${entry.drive}:${entry.gap.toFixed(3)}`)
    .join(' ')
}

for (const sprint of [false, true]) {
  const gait = sprint ? 'running' : 'walking'
  console.log(`
${gait}`)
  await setPasses(false)
  const bare = await walkCourse(sprint)
  await setPasses(true)
  const solved = await walkCourse(sprint)

  for (const part of ['ankle', 'knee']) {
    const clipFloor = narrowest(bare, part)
    const passFloor = narrowest(solved, part)
    console.log(`  ${part}s: narrowest side-by-side gap ${passFloor.toFixed(3)} m with the passes, ${clipFloor.toFixed(3)} m from the clips alone`)
    check(
      `${gait}: the ${part}s never cross`,
      passFloor > 0,
      passFloor > 0 ? '' : offenders(solved, part, 0),
    )
    check(
      `${gait}: the passes bring the ${part}s no closer than the clips do`,
      passFloor >= clipFloor - NARROWING_TOLERANCE_METERS,
      passFloor >= clipFloor - NARROWING_TOLERANCE_METERS ? '' : offenders(solved, part, clipFloor - NARROWING_TOLERANCE_METERS),
    )
  }
}

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
