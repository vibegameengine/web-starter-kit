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
   found by hand before this existed, which is why it exists. */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'

const MAX_ANGULAR_JERK_DEGREES = 14
const MAX_POSITION_JERK_METERS = 0.05
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
    await page.getByTestId('motion-stand-step-1').click()
    collected.push(await readPose())
  }
}

let sprinting = false
for (const scenario of SCENARIOS) {
  console.log(`\n${scenario.name}`)
  await page.getByTestId('motion-stand-reset').click()
  if (Boolean(scenario.sprint) !== sprinting) {
    await page.getByTestId('motion-stand-sprint').click()
    sprinting = Boolean(scenario.sprint)
  }
  await page.getByTestId(`motion-stand-drive-${scenario.drive}`).click()
  const warmup = []
  await stepFrames(WARMUP_FRAMES, warmup)
  const frames = []
  await stepFrames(scenario.frames, frames)
  if (scenario.after) {
    await page.getByTestId(`motion-stand-drive-${scenario.after}`).click()
    await stepFrames(scenario.settle ?? 30, frames)
  } else if (scenario.settle) {
    await stepFrames(scenario.settle, frames)
  }

  const { worstAngle, worstMove } = jerkOf(frames)
  check(
    `${scenario.name}: no bone jerks`,
    worstAngle.value <= MAX_ANGULAR_JERK_DEGREES,
    `worst ${worstAngle.value.toFixed(2)} degrees of change in one frame on ${worstAngle.bone}, frame ${worstAngle.frame}`,
  )
  check(
    `${scenario.name}: no bone jumps`,
    worstMove.value <= MAX_POSITION_JERK_METERS,
    `worst ${worstMove.value.toFixed(4)} m of change in one frame on ${worstMove.bone}, frame ${worstMove.frame}`,
  )
}

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
