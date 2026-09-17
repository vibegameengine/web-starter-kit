/* @important Proves the legs stay legs while the motion stand walks a cycle
   over a step.

     npm run dev
     npm run verify:limbs            # or: node scripts/verify-limbs.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

   A screenshot shows a broken leg; it does not say which frame broke it, and it
   cannot be run again after a change. These are the invariants a leg cannot
   violate however the solver is tuned, checked on every simulated frame:

     bones keep their length          a stretched shin is the classic IK failure
     the foot stays inside its reach  hip-to-foot beyond thigh+shin IS a stretch
     the knee stays a knee            no hyper-extension, no backwards bend
     the foot stays out of the floor  no sinking through the surface under it
     a plant holds its ground         net drift through a plant IS foot skate
     double support stays a fraction  both feet gripping all cycle is the bug

   The last one is what a render loop faster than the simulation tick used to
   break: foot speed read per render frame went to zero between ticks, both feet
   reported full contact, and the solver hauled both legs at once. */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const FRAMES = 90
const BONE_TOLERANCE_METERS = 0.004
const FLOOR_TOLERANCE_METERS = 0.03
const MIN_KNEE_DEGREES = 3
const MAX_KNEE_DEGREES = 178
const MAX_PLANT_DRIFT_METERS = 0.02
const MAX_DOUBLE_SUPPORT_SHARE = 0.25
const TOUCH_MARGIN_METERS = 0.06

const results = []
const check = (name, pass, detail) => {
  results.push({ pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

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

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 200)))

await page.goto(`${BASE}/labs/motion-stand`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => typeof window.__motionFeet === 'function', null, { timeout: 30000 })
await page.getByTestId('motion-stand-drive-forward').click()

const frames = []
for (let frame = 0; frame < FRAMES; frame += 1) {
  await page.getByTestId('motion-stand-step-1').click()
  const limbs = await page.evaluate(() => window.__motionFeet().limbs)
  if (limbs.length === 2) frames.push(limbs)
}

check('the stand reported a limb pair on every frame', frames.length === FRAMES, `${frames.length}/${FRAMES}`)

const stretch = worstOf(frames, (limb) => Math.max(
  Math.abs(distance(limb.hip, limb.knee) - limb.upperLength),
  Math.abs(distance(limb.knee, limb.foot) - limb.lowerLength),
))
check(
  'bones keep their length',
  stretch.value <= BONE_TOLERANCE_METERS,
  `worst ${stretch.value.toFixed(4)} m on leg ${stretch.leg}, frame ${stretch.frame}`,
)

const overReach = worstOf(frames, (limb) => distance(limb.hip, limb.foot) - (limb.upperLength + limb.lowerLength))
check(
  'the foot stays inside the reach of the leg',
  overReach.value <= BONE_TOLERANCE_METERS,
  `worst ${overReach.value.toFixed(4)} m on leg ${overReach.leg}, frame ${overReach.frame}`,
)

const kneeOut = worstOf(frames, (limb) => {
  const angle = kneeDegrees(limb)
  return Math.max(MIN_KNEE_DEGREES - angle, angle - MAX_KNEE_DEGREES)
})
check(
  'the knee stays within a knee range',
  kneeOut.value <= 0,
  `worst ${kneeOut.value.toFixed(2)} degrees outside on leg ${kneeOut.leg}, frame ${kneeOut.frame}`,
)

const sunk = worstOf(
  frames,
  (limb) => (limb.surfaceY === null ? 0 : limb.surfaceY - limb.foot[1]),
)
check(
  'the foot stays out of the floor',
  sunk.value <= FLOOR_TOLERANCE_METERS,
  `worst ${sunk.value.toFixed(4)} m below the surface on leg ${sunk.leg}, frame ${sunk.frame}`,
)

let worstSlide = { frame: -1, leg: -1, value: 0 }
for (let frame = 1; frame < frames.length; frame += 1) {
  for (let leg = 0; leg < 2; leg += 1) {
    const now = frames[frame][leg]
    const before = frames[frame - 1][leg]
    if (false) continue
    const slide = Math.hypot(now.foot[0] - before.foot[0], now.foot[2] - before.foot[2])
    if (slide > worstSlide.value) worstSlide = { frame, leg, value: slide }
  }
}
const plants = []
for (let leg = 0; leg < 2; leg += 1) {
  let run = []
  for (let frame = 0; frame <= frames.length; frame += 1) {
    const limb = frame < frames.length ? frames[frame][leg] : null
    const held = limb !== null && limb.hold > 0.5 && limb.groundGap <= limb.ankleHeight + TOUCH_MARGIN_METERS
    if (held) {
      run.push({ frame, limb })
      continue
    }
    if (run.length > 2) {
      const first = run[1]
      const last = run[run.length - 1]
      plants.push({
        drift: Math.hypot(last.limb.foot[0] - first.limb.foot[0], last.limb.foot[2] - first.limb.foot[2]),
        frames: run.length,
        from: first.frame,
        leg,
      })
    }
    run = []
  }
}

const worstPlant = plants.reduce((worst, plant) => (plant.drift > worst.drift ? plant : worst), { drift: 0, frames: 0, from: -1, leg: -1 })
check(
  'a planted foot holds its ground through the plant',
  plants.length > 0 && worstPlant.drift <= MAX_PLANT_DRIFT_METERS,
  `${plants.length} plants, worst drift ${worstPlant.drift.toFixed(4)} m over ${worstPlant.frames} frames on leg ${worstPlant.leg}, from frame ${worstPlant.from}`,
)

const bothHeld = frames.filter((limbs) => limbs[0].hold > 0.5 && limbs[1].hold > 0.5).length
check(
  'double support stays a fraction of the cycle',
  bothHeld <= frames.length * MAX_DOUBLE_SUPPORT_SHARE,
  `${bothHeld} of ${frames.length} frames held both feet`,
)

const everHeld = frames.some((limbs) => limbs.some((limb) => limb.hold > 0.5))
check('a foot is held at all', everHeld, everHeld ? 'a plant was measured' : 'no plant ever formed')

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass).length
console.log(failed === 0 ? `\nall ${results.length} checks passed` : `\n${failed} of ${results.length} checks failed`)
process.exit(failed === 0 ? 0 : 1)
