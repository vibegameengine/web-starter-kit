/* @important Proves the legs stay legs, in every direction the body travels
   and through a stop.

     npm run dev
     npm run verify:limbs            # or: node scripts/verify-limbs.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

   A screenshot shows a broken leg; it does not say which frame broke it, which
   direction broke it, or whether the change meant to fix it did. These are the
   invariants a leg cannot violate however the solver is tuned, checked on every
   simulated frame of every drive:

     bones keep their length          a stretched shin is the classic IK failure
     the foot stays inside its reach  hip-to-foot beyond thigh+shin IS a stretch
     the knee stays a knee            no hyper-extension, no backwards bend
     the foot stays out of the floor  no sinking through the surface under it
     a plant holds its ground         net drift while firmly held IS foot skate
     a plant forms at all             a cycle with no plant is a glide
     double support stays a fraction  both feet gripping all cycle is the bug

   The last two are what a render loop faster than the simulation tick used to
   break: foot speed read per render frame went to zero between ticks, both feet
   reported full contact, and the solver hauled both legs at once. */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const WALK_FRAMES = 80
const RUN_UP_FRAMES = 40
const STOP_FRAMES = 40
const BONE_TOLERANCE_METERS = 0.004
const FLOOR_TOLERANCE_METERS = 0.03
const MIN_KNEE_DEGREES = 3
const MAX_KNEE_DEGREES = 178
const MAX_PLANT_DRIFT_METERS = 0.02
const MAX_DOUBLE_SUPPORT_SHARE = 0.3
const MAX_RESTING_STANCE_METERS = 0.45
const TOUCH_MARGIN_METERS = 0.06
const FIRM_HOLD = 0.9

const DRIVES = ['forward', 'backward', 'strafe', 'diagonal']

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const touching = (limb) => limb.groundGap <= limb.ankleHeight + TOUCH_MARGIN_METERS

function kneeDegrees(limb) {
  const thigh = [limb.knee[0] - limb.hip[0], limb.knee[1] - limb.hip[1], limb.knee[2] - limb.hip[2]]
  const shin = [limb.foot[0] - limb.knee[0], limb.foot[1] - limb.knee[1], limb.foot[2] - limb.knee[2]]
  const thighLength = Math.hypot(...thigh)
  const shinLength = Math.hypot(...shin)
  if (thighLength < 1e-6 || shinLength < 1e-6) return 180
  const dot = (thigh[0] * shin[0] + thigh[1] * shin[1] + thigh[2] * shin[2]) / (thighLength * shinLength)
  return 180 - (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
}

function worstOf(frames, measure) {
  let worst = null
  frames.forEach((limbs, frame) => {
    limbs.forEach((limb, leg) => {
      const value = measure(limb)
      if (worst === null || value > worst.value) worst = { frame, leg, value }
    })
  })
  return worst ?? { frame: -1, leg: -1, value: 0 }
}

function plantsIn(frames) {
  const plants = []
  for (let leg = 0; leg < 2; leg += 1) {
    let run = []
    for (let frame = 0; frame <= frames.length; frame += 1) {
      const limb = frame < frames.length ? frames[frame][leg] : null
      if (limb !== null && limb.hold > FIRM_HOLD && touching(limb)) {
        run.push({ frame, limb })
        continue
      }
      if (run.length > 2) {
        const first = run[1].limb
        const last = run[run.length - 1].limb
        plants.push({
          drift: Math.hypot(last.foot[0] - first.foot[0], last.foot[2] - first.foot[2]),
          frames: run.length,
          from: run[0].frame,
          leg,
        })
      }
      run = []
    }
  }
  return plants
}

function checkBones(label, frames) {
  const stretch = worstOf(frames, (limb) => Math.max(
    Math.abs(distance(limb.hip, limb.knee) - limb.upperLength),
    Math.abs(distance(limb.knee, limb.foot) - limb.lowerLength),
  ))
  check(
    `${label}: bones keep their length`,
    stretch.value <= BONE_TOLERANCE_METERS,
    `worst ${stretch.value.toFixed(4)} m, leg ${stretch.leg}, frame ${stretch.frame}`,
  )

  const overReach = worstOf(frames, (limb) => distance(limb.hip, limb.foot) - (limb.upperLength + limb.lowerLength))
  check(
    `${label}: the foot stays inside the reach of the leg`,
    overReach.value <= BONE_TOLERANCE_METERS,
    `worst ${overReach.value.toFixed(4)} m, leg ${overReach.leg}, frame ${overReach.frame}`,
  )

  const kneeOut = worstOf(frames, (limb) => {
    const angle = kneeDegrees(limb)
    return Math.max(MIN_KNEE_DEGREES - angle, angle - MAX_KNEE_DEGREES)
  })
  check(
    `${label}: the knee stays within a knee range`,
    kneeOut.value <= 0,
    `worst ${kneeOut.value.toFixed(2)} degrees out, leg ${kneeOut.leg}, frame ${kneeOut.frame}`,
  )
}

function checkPlants(label, frames, resting) {
  const sunk = worstOf(frames, (limb) => (limb.surfaceY === null ? 0 : limb.surfaceY - limb.foot[1]))
  check(
    `${label}: the foot stays out of the floor`,
    sunk.value <= FLOOR_TOLERANCE_METERS,
    `worst ${sunk.value.toFixed(4)} m under, leg ${sunk.leg}, frame ${sunk.frame}`,
  )

  const plants = plantsIn(frames)
  const worstPlant = plants.reduce(
    (worst, plant) => (plant.drift > worst.drift ? plant : worst),
    { drift: 0, frames: 0, from: -1, leg: -1 },
  )
  check(`${label}: a plant forms at all`, plants.length > 0, `${plants.length} plants over ${frames.length} frames`)
  check(
    `${label}: a planted foot holds its ground`,
    worstPlant.drift <= MAX_PLANT_DRIFT_METERS,
    `worst drift ${worstPlant.drift.toFixed(4)} m over ${worstPlant.frames} frames, leg ${worstPlant.leg}`,
  )

  const bothHeld = frames.filter((limbs) => limbs[0].hold > 0.5 && limbs[1].hold > 0.5).length
  if (resting) {
    const settledFrames = frames.slice(-8)
    const standing = settledFrames.filter((limbs) => limbs[0].hold > 0.5 && limbs[1].hold > 0.5).length
    check(
      `${label}: both feet stand once the body is at rest`,
      standing === settledFrames.length,
      `${standing} of the last ${settledFrames.length} frames`,
    )
    return
  }
  check(
    `${label}: double support stays a fraction of the cycle`,
    bothHeld <= frames.length * MAX_DOUBLE_SUPPORT_SHARE,
    `${bothHeld} of ${frames.length} frames`,
  )
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 200)))

await page.goto(`${BASE}/labs/motion-stand`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => typeof window.__motionFeet === 'function', null, { timeout: 30000 })

const readFrame = () => page.evaluate(() => ({
  limbs: window.__motionFeet().limbs,
  matched: window.__motionMatching(),
}))

async function stepFrames(count) {
  const collected = []
  for (let frame = 0; frame < count; frame += 1) {
    await page.getByTestId('motion-stand-step-1').click()
    const reading = await readFrame()
    if (reading.limbs.length === 2) collected.push(reading.limbs)
    collected.matched = reading.matched
  }
  return collected
}

for (const drive of DRIVES) {
  console.log(`\n${drive}`)
  await page.getByTestId('motion-stand-reset').click()
  await page.getByTestId(`motion-stand-drive-${drive}`).click()
  const frames = await stepFrames(WALK_FRAMES)
  check(`${drive}: the stand reported a limb pair every frame`, frames.length === WALK_FRAMES, `${frames.length}/${WALK_FRAMES}`)
  check(`${drive}: the clip chosen travels with the body`, frames.matched.clipSpeed > 0.2, `clip ${frames.matched.clipId} at ${frames.matched.clipSpeed.toFixed(3)} m/s, stride warp ${frames.matched.stride.toFixed(3)}`)
  checkBones(drive, frames)
  checkPlants(drive, frames, false)
}

console.log('\nstop')
await page.getByTestId('motion-stand-reset').click()
await page.getByTestId('motion-stand-drive-forward').click()
await stepFrames(RUN_UP_FRAMES)
await page.getByTestId('motion-stand-drive-still').click()
const stopFrames = await stepFrames(STOP_FRAMES)
checkBones('stop', stopFrames)
checkPlants('stop', stopFrames, true)

const settled = stopFrames[stopFrames.length - 1]
const stanceWidth = Math.hypot(settled[0].foot[0] - settled[1].foot[0], settled[0].foot[2] - settled[1].foot[2])
check(
  'stop: the body comes to rest with its feet under it',
  stanceWidth < MAX_RESTING_STANCE_METERS,
  `feet ${stanceWidth.toFixed(3)} m apart, idle share ${stopFrames.matched.idleShare.toFixed(2)}`,
)
check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
