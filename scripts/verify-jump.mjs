/* @important Jumps on the motion stand, in place and on the move, and asks what a
   jump owes the eye:

     npm run dev
     npm run verify:jump            # or: node scripts/verify-jump.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

     phases        takeoff, then a landing, then walking again, in that order
     on the body   in the air the drawn character is exactly where its collider
                   is; there is nothing under it to stand on
     touchdown     on the frame the collider lands, both feet stand on the floor
                   under them — read from the course geometry, never from the
                   foot pass's own probe
     stairs        walking down a flight never becomes a fall, and walking off a
                   20 cm ledge never plays a landing */
import { chromium } from 'playwright'

import { resetStand, stepStand } from './lib/motionStand.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const AIR_FRAMES = 110
const ON_BODY_METERS = 0.01
const TOUCHDOWN_FLOAT_METERS = 0.04
const TOUCHDOWN_SINK_METERS = 0.03

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
await page.waitForFunction(() => typeof window.__motionFeet === 'function', null, { timeout: 90000 })

async function course(id) {
  await page.getByTestId(`motion-stand-course-${id}`).click()
  await page.waitForFunction(() => typeof window.__motionFeet === 'function' && typeof window.__standSurfaceAt === 'function')
}

const readFrame = () => page.evaluate(() => {
  const feet = window.__motionFeet()
  const matched = window.__motionMatching()
  const body = window.__motionBody()
  return {
    air: matched.air,
    characterFloor: feet.characterFloor,
    colliderFloor: feet.colliderFloor,
    feet: feet.limbs.map((limb) => ({
      ankle: limb.foot[1] - window.__standSurfaceAt(limb.foot[0], limb.foot[2]),
      toe: limb.toe[1] - window.__standSurfaceAt(limb.toe[0], limb.toe[2]),
    })),
    mode: body.mode,
  }
})

async function frames(count) {
  const collected = []
  for (let frame = 0; frame < count; frame += 1) {
    await stepStand(page)
    collected.push(await readFrame())
  }
  return collected
}

let restAnkle = 0
let restToe = 0

function soleGap(foot) {
  return Math.min(foot.ankle - restAnkle, foot.toe - restToe)
}

function phaseOrder(collected) {
  const order = []
  for (const frame of collected) if (order[order.length - 1] !== frame.air) order.push(frame.air)
  return order
}

async function jump(label, drive) {
  console.log(`\n${label}`)
  await resetStand(page)
  await page.getByTestId(`motion-stand-drive-${drive}`).click()
  await frames(drive === 'still' ? 20 : 50)
  await page.getByTestId('motion-stand-jump').click()
  const collected = await frames(AIR_FRAMES)

  const order = phaseOrder(collected)
  const landed = order.indexOf('land')
  check(`${label}: it takes off, lands and walks on`, order[0] === 'rise' && landed > 0 && order[order.length - 1] === 'ground', order.join(' > '))

  const airborne = collected.filter((frame) => frame.mode === 'falling')
  const worstOff = airborne.reduce((worst, frame) => Math.max(worst, Math.abs(frame.characterFloor - frame.colliderFloor)), 0)
  check(`${label}: in the air the character is on its collider`, airborne.length > 10 && worstOff <= ON_BODY_METERS, `${airborne.length} airborne frames, worst ${worstOff.toFixed(4)} m apart`)

  const touchdown = collected.findIndex((frame, index) => index > 0 && frame.mode === 'walking' && collected[index - 1].mode === 'falling')
  const gaps = touchdown >= 0 ? collected[touchdown].feet.map(soleGap) : []
  const floating = Math.max(...gaps)
  const sunk = -Math.min(...gaps)
  check(
    `${label}: both feet are on the floor at touchdown`,
    touchdown >= 0 && floating <= TOUCHDOWN_FLOAT_METERS && sunk <= TOUCHDOWN_SINK_METERS,
    touchdown >= 0 ? `frame ${touchdown}: ${gaps.map((gap) => gap.toFixed(3)).join(' / ')} m above the floor` : 'never touched down',
  )
}

await course('flat')
await resetStand(page)
await page.getByTestId('motion-stand-drive-still').click()
const standing = (await frames(30)).at(-1)
restAnkle = standing.feet.reduce((sum, foot) => sum + foot.ankle, 0) / standing.feet.length
restToe = standing.feet.reduce((sum, foot) => sum + foot.toe, 0) / standing.feet.length
console.log(`rest heights: ankle ${restAnkle.toFixed(3)} m, toe ${restToe.toFixed(3)} m above the floor`)

await jump('jumping in place', 'still')
await jump('jumping while walking', 'forward')

console.log('\nstairs and ledges')
await course('stairs')
await resetStand(page)
await page.getByTestId('motion-stand-drive-forward').click()
await frames(150)
await page.getByTestId('motion-stand-drive-backward').click()
const descent = await frames(170)
const descentPhases = new Set(descent.map((frame) => frame.air))
check('walking down a flight never becomes a fall', !descentPhases.has('fall') && !descentPhases.has('land'), [...descentPhases].join(', '))

await course('ledge')
await resetStand(page)
await page.getByTestId('motion-stand-drive-forward').click()
const ledgeWalk = await frames(140)
const ledgePhases = new Set(ledgeWalk.map((frame) => frame.air))
check('walking off a 20 cm ledge never plays a landing', !ledgePhases.has('land'), [...ledgePhases].join(', '))

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
