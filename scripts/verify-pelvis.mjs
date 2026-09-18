/* @important Watches where the body actually IS, in the world, against where the
   capsule that drives it is.

     npm run dev
     npm run verify:pelvis          # or: node scripts/verify-pelvis.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

   Everything else here measures bones in the body's own frame, which is blind
   by construction to the whole class of defect that moves the body: a clip that
   kept its root motion slid the mesh 86 cm off the capsule, and a pelvis drop
   written through a world round trip dragged the hips sideways on every turn.
   Both were invisible to a body-relative check and obvious the moment the world
   was asked.

   So the measurement is the offset from the capsule to the hips, in world
   space, and what it must obey:

     under the capsule    the hips stay within a hand's width of the collider,
                          sideways and fore and aft
     no jumps             that offset never moves far in a single frame
     no creep             it comes back, rather than growing run after run
     upright              the hips do not sink below what the pelvis solver is
                          allowed to take them down by */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'

const MAX_OFFSET_METERS = 0.2
const MAX_OFFSET_JUMP_METERS = 0.04
const MAX_CREEP_METERS = 0.05
const MAX_PELVIS_DROP_METERS = 0.2
const WARMUP_FRAMES = 6

const SCENARIOS = [
  { drive: 'forward', frames: 80, name: 'walking' },
  { drive: 'strafe', frames: 60, name: 'strafing' },
  { drive: 'diagonal', frames: 60, name: 'diagonal' },
  { drive: 'backward', frames: 60, name: 'turning about' },
  { after: 'still', drive: 'forward', frames: 40, name: 'stopping', settle: 40 },
  { drive: 'forward', frames: 60, name: 'running', settle: 30, sprint: true },
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
await page.waitForFunction(() => typeof window.__motionBody === 'function', null, { timeout: 30000 })

const readFrame = () => page.evaluate(() => {
  let hips = null
  window.__labScene.traverse((node) => {
    if (!hips && /Hips$/.test(node.name)) hips = node
  })
  const world = hips.getWorldPosition(new (Object.getPrototypeOf(hips.position).constructor)())
  const body = window.__motionBody()
  const feet = window.__motionFeet()
  return {
    body: [body.position[0], body.position[1], body.position[2]],
    drop: feet.pelvisDrop,
    facing: body.bodyFacingRadians,
    hips: [world.x, world.y, world.z],
  }
})

function offsetsOf(frames) {
  return frames.map((frame) => {
    const dx = frame.hips[0] - frame.body[0]
    const dz = frame.hips[2] - frame.body[2]
    const forward = { x: Math.sin(frame.facing), z: Math.cos(frame.facing) }
    return {
      across: dx * -Math.cos(frame.facing) + dz * Math.sin(frame.facing),
      drop: frame.drop,
      lengthwise: dx * forward.x + dz * forward.z,
      vertical: frame.hips[1] - frame.body[1],
    }
  })
}

async function stepFrames(count) {
  const collected = []
  for (let frame = 0; frame < count; frame += 1) {
    await page.getByTestId('motion-stand-step-1').click()
    collected.push(await readFrame())
  }
  return collected
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
  await stepFrames(WARMUP_FRAMES)
  const frames = await stepFrames(scenario.frames)
  if (scenario.after) {
    await page.getByTestId(`motion-stand-drive-${scenario.after}`).click()
    frames.push(...await stepFrames(scenario.settle ?? 30))
  }

  const offsets = offsetsOf(frames)
  const worstAcross = offsets.reduce((worst, offset) => Math.max(worst, Math.abs(offset.across)), 0)
  const worstLengthwise = offsets.reduce((worst, offset) => Math.max(worst, Math.abs(offset.lengthwise)), 0)
  check(
    `${scenario.name}: the hips stay over the capsule`,
    worstAcross <= MAX_OFFSET_METERS && worstLengthwise <= MAX_OFFSET_METERS,
    `worst ${worstAcross.toFixed(3)} m across, ${worstLengthwise.toFixed(3)} m fore and aft`,
  )

  let worstJump = 0
  for (let frame = 1; frame < offsets.length; frame += 1) {
    const now = offsets[frame]
    const before = offsets[frame - 1]
    worstJump = Math.max(worstJump, Math.hypot(now.across - before.across, now.lengthwise - before.lengthwise))
  }
  check(
    `${scenario.name}: that offset never jumps`,
    worstJump <= MAX_OFFSET_JUMP_METERS,
    `worst ${worstJump.toFixed(4)} m in one frame`,
  )

  const first = offsets.slice(0, 10)
  const last = offsets.slice(-10)
  const mean = (values, pick) => values.reduce((sum, value) => sum + pick(value), 0) / values.length
  const creep = Math.hypot(
    mean(last, (offset) => offset.across) - mean(first, (offset) => offset.across),
    mean(last, (offset) => offset.lengthwise) - mean(first, (offset) => offset.lengthwise),
  )
  check(
    `${scenario.name}: the body does not creep off its capsule`,
    creep <= MAX_CREEP_METERS,
    `${creep.toFixed(4)} m between the start and the end`,
  )

  const worstDrop = offsets.reduce((worst, offset) => Math.max(worst, offset.drop), 0)
  check(
    `${scenario.name}: the pelvis stays inside the drop it is allowed`,
    worstDrop <= MAX_PELVIS_DROP_METERS + 1e-6,
    `worst drop ${worstDrop.toFixed(3)} m`,
  )
}

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
