/* @important Catches pops: a bone that jerks between one simulated frame and
   the next, wherever it comes from — a clip that was authored with a spike, a
   blend that switched without matching phase, a lock that let go all at once,
   or a solver that flipped a joint to the other side.

     npm run dev
     npm run verify:spikes          # or: node scripts/verify-motion-spikes.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

   The measurement is the second difference of each bone's LOCAL rotation. The
   first difference is angular speed, which is large and perfectly fine in a
   fast stride; it is the change in that speed from frame to frame that the eye
   reads as a pop. Local rotations are used so the body's own travel and turning
   never enter the number.

   Positions are watched too, but relative to the body: a foot that jumps 50 cm
   in one frame is a pop even though nothing about the rotation looks odd. That
   exact defect — a lock released outright instead of over a few frames — was
   found by hand before this existed, which is why it exists.

   Every scenario is run twice, once with the procedural passes off, and the
   pass has to be no worse than its own absence. A swing foot accelerates hard
   at toe-off and a clip can be authored with a jerk of its own, so an absolute
   threshold on its own would either pass everything or fail the animation for
   being an animation. The difference is the part this system is answerable
   for. */
import { chromium } from 'playwright'

import { resetStand, stepStand } from './lib/motionStand.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5173'

const MAX_ANGULAR_JERK_DEGREES = 30
const MAX_POSITION_JERK_METERS = 0.3
const MAX_ANGULAR_JERK_ADDED_DEGREES = 6
const MAX_POSITION_JERK_ADDED_METERS = 0.03
const WARMUP_FRAMES = 6

const SCENARIOS = [
  { drive: 'forward', frames: 70, name: 'walking' },
  { drive: 'strafe', frames: 50, name: 'strafing' },
  { drive: 'diagonal', frames: 50, name: 'diagonal' },
  { drive: 'backward', frames: 50, name: 'backing up' },
  { after: 'still', drive: 'forward', frames: 40, name: 'stopping', settle: 40 },
  { drive: 'forward', frames: 40, name: 'breaking into a run', sprint: true, settle: 40 },
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
await page.waitForFunction(() => window.__labScene !== undefined, null, { timeout: 30000 })

const readPose = () => page.evaluate(() => {
  const bones = []
  window.__labScene.traverse((node) => {
    if (node.isBone || node.type === 'Bone') bones.push(node)
  })
  const root = bones[0]
  const rootInverse = root ? root.matrixWorld.clone().invert() : null
  return bones.map((bone) => {
    const local = bone.quaternion
    const inBody = bone.matrixWorld.clone()
    if (rootInverse) inBody.premultiply(rootInverse)
    const position = [inBody.elements[12], inBody.elements[13], inBody.elements[14]]
    return { name: bone.name, position, rotation: [local.x, local.y, local.z, local.w] }
  })
})

function angleBetween(left, right) {
  const dot = Math.abs(left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3])
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

function jerkOf(frames) {
  let worstAngle = { bone: 'none', frame: -1, value: 0 }
  let worstMove = { bone: 'none', frame: -1, value: 0 }
  for (let frame = 2; frame < frames.length; frame += 1) {
    const previous = frames[frame - 2]
    const middle = frames[frame - 1]
    const current = frames[frame]
    for (let bone = 0; bone < current.length; bone += 1) {
      if (!middle[bone] || !previous[bone] || middle[bone].name !== current[bone].name) continue
      const angleNow = angleBetween(middle[bone].rotation, current[bone].rotation)
      const angleBefore = angleBetween(previous[bone].rotation, middle[bone].rotation)
      const angleJerk = Math.abs(angleNow - angleBefore)
      if (angleJerk > worstAngle.value) worstAngle = { bone: current[bone].name, frame, value: angleJerk }

      const moveNow = distance(middle[bone].position, current[bone].position)
      const moveBefore = distance(previous[bone].position, middle[bone].position)
      const moveJerk = Math.abs(moveNow - moveBefore)
      if (moveJerk > worstMove.value) worstMove = { bone: current[bone].name, frame, value: moveJerk }
    }
  }
  return { worstAngle, worstMove }
}

async function stepFrames(count, collected) {
  for (let frame = 0; frame < count; frame += 1) {
    await stepStand(page)
    collected.push(await readPose())
  }
}

let sprinting = false
let passesOn = true

async function setPasses(wanted) {
  if (passesOn === wanted) return
  await page.getByTestId('motion-stand-pass-feet').click()
  await page.getByTestId('motion-stand-pass-warp').click()
  passesOn = wanted
}

async function runScenario(scenario) {
  await resetStand(page)
  if (Boolean(scenario.sprint) !== sprinting) {
    await page.getByTestId('motion-stand-sprint').click()
    sprinting = Boolean(scenario.sprint)
  }
  await page.getByTestId(`motion-stand-drive-${scenario.drive}`).click()
  await stepFrames(WARMUP_FRAMES, [])
  const frames = []
  await stepFrames(scenario.frames, frames)
  if (scenario.after) {
    await page.getByTestId(`motion-stand-drive-${scenario.after}`).click()
    await stepFrames(scenario.settle ?? 30, frames)
  } else if (scenario.settle) {
    await stepFrames(scenario.settle, frames)
  }
  return jerkOf(frames)
}

for (const scenario of SCENARIOS) {
  console.log(`
${scenario.name}`)
  await setPasses(true)
  const withPasses = await runScenario(scenario)
  await setPasses(false)
  const bare = await runScenario(scenario)

  check(
    `${scenario.name}: no bone jerks`,
    withPasses.worstAngle.value <= MAX_ANGULAR_JERK_DEGREES,
    `worst ${withPasses.worstAngle.value.toFixed(2)} degrees on ${withPasses.worstAngle.bone}, frame ${withPasses.worstAngle.frame}`,
  )
  check(
    `${scenario.name}: the passes add no jerk of their own`,
    withPasses.worstAngle.value <= bare.worstAngle.value + MAX_ANGULAR_JERK_ADDED_DEGREES,
    `${withPasses.worstAngle.value.toFixed(2)} degrees against ${bare.worstAngle.value.toFixed(2)} from the clips alone`,
  )
  check(
    `${scenario.name}: no bone jumps`,
    withPasses.worstMove.value <= MAX_POSITION_JERK_METERS,
    `worst ${withPasses.worstMove.value.toFixed(4)} m on ${withPasses.worstMove.bone}, frame ${withPasses.worstMove.frame}`,
  )
  check(
    `${scenario.name}: the passes add no jump of their own`,
    withPasses.worstMove.value <= bare.worstMove.value + MAX_POSITION_JERK_ADDED_METERS,
    `${withPasses.worstMove.value.toFixed(4)} m against ${bare.worstMove.value.toFixed(4)} from the clips alone`,
  )
}

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
