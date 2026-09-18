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
     the knee bends forward           in the BODY's frame, and by the same
                                      amount wherever the body stands: a pole
                                      handed to the solver as a world position
                                      bends the knee toward the origin instead
     a standing foot is on the ground a foot held in the air is not standing
     the two legs match at rest       eight centimetres between them is not a
                                      stance, and one maximum over both legs
                                      hides it

   The check runs twice for every drive, once with the procedural pass off, and
   requires the pass to be no worse than its own absence: a pass that makes the
   pose worse than doing nothing is the one thing a set of legality checks can
   never notice.

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
const MAX_RESTING_STANCE_METERS = 0.32
const MAX_RESTING_ASYMMETRY_METERS = 0.04
const MAX_RESTING_CREEP_METERS = 0.004
const MAX_STANDING_FOOT_LIFT_METERS = 0.05
const MAX_BEND_DRIFT_METERS = 0.02
const FAR_FRAMES = 160
const MIN_FORWARD_BEND_METERS = 0.01
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

/* @important Fore-and-aft and across are separated on purpose: one scalar
   distance between the feet cannot tell a normal stance width from a frozen
   half-stride, and the frozen half-stride is the defect. */
function stanceOf(limbs) {
  const facing = limbs.facingRadians ?? 0
  const dx = limbs[0].foot[0] - limbs[1].foot[0]
  const dz = limbs[0].foot[2] - limbs[1].foot[2]
  const forward = { x: Math.sin(facing), z: Math.cos(facing) }
  return {
    across: Math.abs(dx * -Math.cos(facing) + dz * Math.sin(facing)),
    lengthwise: Math.abs(dx * forward.x + dz * forward.z),
  }
}

function checkBend(label, frames) {
  const sideways = worstOf(frames, (limb) => Math.abs(limb.bendSideways))
  check(
    `${label}: the knee bends forward, not sideways`,
    sideways.value <= 0.05,
    `worst ${sideways.value.toFixed(4)} m sideways, leg ${sideways.leg}, frame ${sideways.frame}`,
  )
  const backward = worstOf(frames, (limb) => MIN_FORWARD_BEND_METERS - limb.bendForward)
  check(
    `${label}: no knee bends backwards`,
    backward.value <= 0,
    `worst ${(MIN_FORWARD_BEND_METERS - backward.value).toFixed(4)} m forward, leg ${backward.leg}, frame ${backward.frame}`,
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
  if (!resting) {
    check(`${label}: a plant forms at all`, plants.length > 0, `${plants.length} plants over ${frames.length} frames`)
  }
  check(
    `${label}: a planted foot holds its ground`,
    worstPlant.drift <= MAX_PLANT_DRIFT_METERS,
    `worst drift ${worstPlant.drift.toFixed(4)} m over ${worstPlant.frames} frames, leg ${worstPlant.leg}`,
  )

  const bothHeld = frames.filter((limbs) => limbs[0].hold > 0.5 && limbs[1].hold > 0.5).length
  if (resting) {
    const settledFrames = frames.slice(-8)
    /* @important What a body at rest owes is not a lock but a pose: both feet on
       the ground and neither of them moving. Demanding a lock instead measured
       the mechanism, and it went green precisely when the mechanism was stuck. */
    const grounded = settledFrames.filter((limbs) => limbs.every((limb) => touching(limb))).length
    check(
      `${label}: both feet are on the ground once the body is at rest`,
      grounded === settledFrames.length,
      `${grounded} of the last ${settledFrames.length} frames`,
    )
    let worstCreep = 0
    for (let frame = 1; frame < settledFrames.length; frame += 1) {
      for (let leg = 0; leg < 2; leg += 1) {
        const now = settledFrames[frame][leg].foot
        const before = settledFrames[frame - 1][leg].foot
        worstCreep = Math.max(worstCreep, Math.hypot(now[0] - before[0], now[2] - before[2]))
      }
    }
    check(
      `${label}: neither foot creeps while the body rests`,
      worstCreep <= MAX_RESTING_CREEP_METERS,
      `worst ${worstCreep.toFixed(4)} m in one frame`,
    )
    const lift = worstOf(settledFrames, (limb) => limb.groundGap - limb.ankleHeight)
    check(
      `${label}: neither foot is held in the air at rest`,
      lift.value <= MAX_STANDING_FOOT_LIFT_METERS,
      `worst ${lift.value.toFixed(4)} m above its own ankle height, leg ${lift.leg}`,
    )
    const last = frames[frames.length - 1]
    const asymmetry = Math.abs(last[0].groundGap - last[1].groundGap)
    check(
      `${label}: the two feet rest at the same height`,
      asymmetry <= MAX_RESTING_ASYMMETRY_METERS,
      `${asymmetry.toFixed(4)} m apart in height`,
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
  facingRadians: window.__motionFeet().facingRadians,
  limbs: window.__motionFeet().limbs,
  matched: window.__motionMatching(),
}))

async function stepFrames(count) {
  const collected = []
  for (let frame = 0; frame < count; frame += 1) {
    await page.getByTestId('motion-stand-step-1').click()
    const reading = await readFrame()
    if (reading.limbs.length !== 2) continue
    reading.limbs.facingRadians = reading.facingRadians
    collected.push(reading.limbs)
    collected.matched = reading.matched
  }
  return collected
}

const bends = {}
for (const drive of DRIVES) {
  console.log(`\n${drive}`)
  await page.getByTestId('motion-stand-reset').click()
  await page.getByTestId(`motion-stand-drive-${drive}`).click()
  const frames = await stepFrames(WALK_FRAMES)
  check(`${drive}: the stand reported a limb pair every frame`, frames.length === WALK_FRAMES, `${frames.length}/${WALK_FRAMES}`)
  check(
    `${drive}: the clip chosen travels with the body`,
    frames.matched.clipSpeed > 0.2,
    `clip ${frames.matched.clipId} at ${frames.matched.clipSpeed.toFixed(3)} m/s, stride warp ${frames.matched.stride.toFixed(3)}`,
  )
  checkBones(drive, frames)
  checkPlants(drive, frames, false)
  checkBend(drive, frames)
  bends[drive] = frames.map((limbs) => limbs.map((limb) => limb.bendSideways))
}

console.log('\nstanding from a reset')
await page.getByTestId('motion-stand-reset').click()
await page.getByTestId('motion-stand-drive-still').click()
const standing = await stepFrames(STOP_FRAMES)
checkBones('standing', standing)
checkPlants('standing', standing, true)
checkBend('standing', standing)
const standingStance = stanceOf(standing[standing.length - 1])
check(
  'standing: the feet rest under the body, not split fore and aft',
  standingStance.lengthwise <= MAX_RESTING_STANCE_METERS,
  `${standingStance.lengthwise.toFixed(3)} m fore and aft, ${standingStance.across.toFixed(3)} m across`,
)

console.log('\nstanding with the pass off')
await page.getByTestId('motion-stand-pass-feet').click()
const bare = await stepFrames(STOP_FRAMES)
await page.getByTestId('motion-stand-pass-feet').click()
const bareLift = worstOf(bare.slice(-8), (limb) => limb.groundGap - limb.ankleHeight)
const passLift = worstOf(standing.slice(-8), (limb) => limb.groundGap - limb.ankleHeight)
check(
  'the pass leaves a standing foot no higher than its own absence does',
  passLift.value <= bareLift.value + 0.01,
  `pass ${passLift.value.toFixed(4)} m against ${bareLift.value.toFixed(4)} m without it`,
)
const bareBend = worstOf(bare.slice(-8), (limb) => Math.abs(limb.bendSideways))
const passBend = worstOf(standing.slice(-8), (limb) => Math.abs(limb.bendSideways))
check(
  'the pass bends a standing knee no further sideways than its own absence does',
  passBend.value <= bareBend.value + 0.01,
  `pass ${passBend.value.toFixed(4)} m against ${bareBend.value.toFixed(4)} m without it`,
)

console.log('\nwalked out from the origin')
await page.getByTestId('motion-stand-reset').click()
await page.getByTestId('motion-stand-drive-forward').click()
const nearOrigin = await stepFrames(WALK_FRAMES)
const walkedOut = await stepFrames(FAR_FRAMES)
const meanBend = (collected) => {
  const values = collected.flatMap((limbs) => limbs.map((limb) => limb.bendSideways))
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
const drift = Math.abs(meanBend(walkedOut.slice(-40)) - meanBend(nearOrigin.slice(-40)))
check(
  'the knee bends the same way far from the origin as it does at it',
  drift <= MAX_BEND_DRIFT_METERS,
  `${drift.toFixed(4)} m of drift after walking out`,
)

console.log('\nstop')
await page.getByTestId('motion-stand-reset').click()
await page.getByTestId('motion-stand-drive-forward').click()
await stepFrames(RUN_UP_FRAMES)
await page.getByTestId('motion-stand-drive-still').click()
const stopFrames = await stepFrames(STOP_FRAMES)
checkBones('stop', stopFrames)
checkPlants('stop', stopFrames, true)
checkBend('stop', stopFrames)
const stopStance = stanceOf(stopFrames[stopFrames.length - 1])
check(
  'stop: the body comes to rest with its feet under it',
  stopStance.lengthwise <= MAX_RESTING_STANCE_METERS,
  `${stopStance.lengthwise.toFixed(3)} m fore and aft, ${stopStance.across.toFixed(3)} m across`,
)

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
