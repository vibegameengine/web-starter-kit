/* @important Walks the bench up a real staircase and back down, and asks the one
   thing foot placement is for: does each foot that is standing stand ON the step
   under it.

     npm run dev
     npm run verify:stairs          # or: node scripts/verify-stairs.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

   None of the other checks ever put a step under a foot. The limb check walks a
   single 20 cm block, and the lab's "staircase" has treads 1.2 m deep, which is
   four platforms rather than stairs — a foot meets an edge there only by
   accident. The bench course used here is 15 cm up and 32 cm deep, domestic
   proportions, so almost every footfall lands on a different step and a heel or
   a toe hangs over a nosing on most of them.

     on the step       a planted foot sits at its own ankle height above the
                       tread under it — not floating over it, not sunk into it
     never inside      no foot below the surface it is standing over
     reached           the leg is never stretched past its own span to get there
     climbed           the body actually went up the flight and came back down,
                       or every other number here is about flat ground */
import { chromium } from 'playwright'

import { resetStand, stepStand } from './lib/motionStand.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5173'

const CLIMB_FRAMES = 150
const DESCENT_FRAMES = 170
const STAIR_HEIGHT = 0.9
const PLANTED_CONTACT = 0.8
const MAX_FLOAT_METERS = 0.035
const MAX_SINK_METERS = 0.02
const REACH_TOLERANCE_METERS = 0.004

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
await page.getByTestId('motion-stand-course-stairs').click()
await page.waitForFunction(() => typeof window.__motionFeet === 'function', null, { timeout: 30000 })

/* @important The surface under each point of the foot comes from the course
   geometry itself, through window.__standSurfaceAt, never from the pass's own
   ground probe: a check that shares the pass's probe agrees with the pass by
   construction and cannot see a foot standing on the wrong tread. The rest
   heights of the ankle and toe bones are calibrated standing on the flat, so a
   foot standing properly reads zero rather than whatever a typed constant
   says. */
const readFrame = () => page.evaluate(() => {
  const feet = window.__motionFeet()
  return {
    body: window.__motionBody().position,
    drop: feet.pelvisDrop,
    limbs: feet.limbs.map((limb) => ({
      ...limb,
      ankleSurface: window.__standSurfaceAt(limb.foot[0], limb.foot[2]),
      toeSurface: window.__standSurfaceAt(limb.toe[0], limb.toe[2]),
    })),
  }
})

let restAnkle = 0
let restToe = 0

function trueGapOf(limb) {
  return Math.min(limb.foot[1] - restAnkle - limb.ankleSurface, limb.toe[1] - restToe - limb.toeSurface)
}

async function walk(drive, frames) {
  await page.getByTestId(`motion-stand-drive-${drive}`).click()
  const collected = []
  for (let frame = 0; frame < frames; frame += 1) {
    await stepStand(page)
    collected.push(await readFrame())
  }
  return collected
}

function planted(frames) {
  const found = []
  frames.forEach((frame, index) => {
    frame.limbs.forEach((limb, leg) => {
      if (limb.contact >= PLANTED_CONTACT && limb.surfaceY !== null && limb.hold > 0.5) {
        found.push({ frame: index, leg, limb })
      }
    })
  })
  return found
}

function checkFlight(label, frames) {
  console.log(`\n${label}`)
  const heights = frames.map((frame) => frame.body[1])
  const rise = Math.max(...heights) - Math.min(...heights)
  check(`${label}: the body went through the flight`, rise >= STAIR_HEIGHT * 0.8, `${rise.toFixed(3)} m of height covered`)

  const feet = planted(frames)
  check(`${label}: feet were planted on the way`, feet.length >= 20, `${feet.length} planted foot-frames`)

  /* @important The foot is judged by its LOWEST point, the sole under the
     ankle or the toe, whichever is lower — not by the ankle. At toe-off the heel
     rises and the ankle with it while the toe is still on the tread, which is
     the walk and not a defect: measured by the ankle, flat ground itself read
     12 cm of "floating". */
  const gaps = feet.map((entry) => trueGapOf(entry.limb)).sort((left, right) => left - right)
  const share = (predicate) => gaps.filter(predicate).length / Math.max(1, gaps.length)
  const percentile = (fraction) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * fraction))] ?? 0
  console.log(
    `  distribution: p5 ${percentile(0.05).toFixed(3)} m, median ${percentile(0.5).toFixed(3)} m, p95 ${percentile(0.95).toFixed(3)} m;` +
    ` ${(share((gap) => gap > MAX_FLOAT_METERS) * 100).toFixed(1)}% floating, ${(share((gap) => -gap > MAX_SINK_METERS) * 100).toFixed(1)}% sunk`,
  )
  const offenders = feet
    .map((entry) => ({ ...entry, gap: trueGapOf(entry.limb) }))
    .filter((entry) => entry.gap > MAX_FLOAT_METERS || -entry.gap > MAX_SINK_METERS)
    .map((entry) => `f${entry.frame}/L${entry.leg}:${entry.gap.toFixed(2)}`)
  if (offenders.length > 0) console.log(`  offenders: ${offenders.slice(0, 24).join(' ')}`)

  const floating = feet.reduce((worst, entry) => {
    const lift = trueGapOf(entry.limb)
    return lift > worst.value ? { ...entry, value: lift } : worst
  }, { frame: -1, leg: -1, value: Number.NEGATIVE_INFINITY })
  check(
    `${label}: a planted foot stands on its step, not over it`,
    floating.value <= MAX_FLOAT_METERS,
    `worst ${floating.value.toFixed(4)} m above its tread, leg ${floating.leg}, frame ${floating.frame}`,
  )

  const sunk = feet.reduce((worst, entry) => {
    const depth = -trueGapOf(entry.limb)
    return depth > worst.value ? { ...entry, value: depth } : worst
  }, { frame: -1, leg: -1, value: Number.NEGATIVE_INFINITY })
  check(
    `${label}: a planted foot does not sink into its step`,
    sunk.value <= MAX_SINK_METERS,
    `worst ${sunk.value.toFixed(4)} m into its tread, leg ${sunk.leg}, frame ${sunk.frame}`,
  )

  let stretched = { frame: -1, leg: -1, value: Number.NEGATIVE_INFINITY }
  frames.forEach((frame, index) => {
    frame.limbs.forEach((limb, leg) => {
      const span = Math.hypot(limb.foot[0] - limb.hip[0], limb.foot[1] - limb.hip[1], limb.foot[2] - limb.hip[2])
      const over = span - (limb.upperLength + limb.lowerLength)
      if (over > stretched.value) stretched = { frame: index, leg, value: over }
    })
  })
  check(
    `${label}: no leg is stretched past its span to reach a step`,
    stretched.value <= REACH_TOLERANCE_METERS,
    `worst ${stretched.value.toFixed(4)} m over, leg ${stretched.leg}, frame ${stretched.frame}`,
  )
}

await resetStand(page)
const calibration = await walk('still', 30)
const standing = calibration[calibration.length - 1].limbs
restAnkle = standing.reduce((sum, limb) => sum + limb.foot[1] - limb.ankleSurface, 0) / standing.length
restToe = standing.reduce((sum, limb) => sum + limb.toe[1] - limb.toeSurface, 0) / standing.length
console.log(`rest heights: ankle ${restAnkle.toFixed(3)} m, toe ${restToe.toFixed(3)} m above the floor`)

await resetStand(page)
const climbing = await walk('forward', CLIMB_FRAMES)
checkFlight('climbing', climbing)

const descending = await walk('backward', DESCENT_FRAMES)
checkFlight('descending', descending)

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
