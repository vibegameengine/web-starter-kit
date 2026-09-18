/* @important Catches ghosting: the character shimmering against the world
   because two things that move together are not sampled from the same clock.

     npm run dev
     npm run verify:judder          # or: node scripts/verify-judder.mjs [baseUrl]

   Headed on purpose (AGENTS.md rule 1).

   The simulation runs at a fixed tick and the screen does not, so the body's
   render position is interpolated between the last two ticks. Anything that
   follows the body and reads the RAW tick state instead — a camera, a pass that
   places the feet — moves in steps of one tick while the mesh moves smoothly,
   and the difference between them is what the eye reads as juddering or
   ghosting. Nothing in a per-tick check can see it: sampled once per tick, both
   are perfectly smooth.

   So this samples per RENDERED FRAME, in the lab, where the frame rate is well
   above the tick rate, and measures:

     the mesh against the world     the hips' own world motion per frame
     the mesh against the camera    what the eye actually sees, which is the
                                    one that matters
     evenness                       a frame that moves twice as far as its
                                    neighbours is a stutter, however small the
                                    average looks

   The threshold on the relative speed comes from the defect itself rather than
   from taste: with the camera following the raw tick state it measures
   0.048 m/s, and with it following the interpolated body 0.005 — so 0.02
   separates them with room on both sides. Anyone changing it should re-run that
   mutation rather than pick a number. */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'

const SAMPLE_FRAMES = 240
const MAX_UNEVENNESS = 1.9
const MAX_VARIATION = 0.35
const MAX_RELATIVE_SPEED = 0.02
const MAX_FROZEN_SHARE = 0.08
const LONG_WINDOW_FRAMES = 120
const LONG_WINDOWS = 10

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 200)))

await page.goto(`${BASE}/labs/motion-lab`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => typeof window.__motionBody === 'function', null, { timeout: 30000 })
await page.waitForTimeout(2500)
await page.keyboard.press('KeyH')

/* @important The body is brought up to a steady walk before anything is
   sampled. While it accelerates, the camera legitimately lags and catches up,
   and the relative motion varies for a reason that is not judder — measuring
   through that window says nothing either way. */
async function sampleWhileWalking(frames) {
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1600)
  const samples = await page.evaluate((count) => new Promise((done) => {
    const collected = []
    let hips = null
    let left = null
    let right = null
    window.__labScene.traverse((node) => {
      if (!hips && /Hips$/.test(node.name)) hips = node
      if (!left && /LeftFoot$/.test(node.name)) left = node
      if (!right && /RightFoot$/.test(node.name)) right = node
    })
    const camera = window.__labCamera
    const Vector = Object.getPrototypeOf(hips.position).constructor
    const at = (bone) => {
      const world = bone.getWorldPosition(new Vector())
      return [world.x, world.y, world.z]
    }
    const take = () => {
      collected.push({
        camera: [camera.position.x, camera.position.y, camera.position.z],
        hips: at(hips),
        left: at(left),
        right: at(right),
        time: performance.now(),
      })
      if (collected.length >= count) {
        done(collected)
        return
      }
      requestAnimationFrame(take)
    }
    requestAnimationFrame(take)
  }), frames)
  await page.keyboard.up('KeyW')
  return samples
}

function stepsOf(samples, pick) {
  const steps = []
  for (let index = 1; index < samples.length; index += 1) {
    const now = pick(samples[index])
    const before = pick(samples[index - 1])
    const seconds = (samples[index].time - samples[index - 1].time) / 1000
    if (seconds <= 0) continue
    steps.push(Math.hypot(now[0] - before[0], now[2] - before[2]) / seconds)
  }
  return steps
}

function evenness(steps) {
  const moving = steps.filter((step) => step > 0.05)
  if (moving.length < 10) return { median: 0, ratio: 0, variation: 0 }
  const sorted = [...moving].sort((left, right) => left - right)
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = moving.reduce((sum, step) => sum + step, 0) / moving.length
  const deviation = Math.sqrt(moving.reduce((sum, step) => sum + (step - mean) ** 2, 0) / moving.length)
  return { median, ratio: sorted[Math.floor(sorted.length * 0.98)] / median, variation: deviation / mean }
}

/* @important Ghosting was reported as arriving "not at once, but after a
   while", and a three-second sample cannot see that. So the walk is long — it
   crosses the course's steps and blocks, where the camera's spring arm starts
   touching geometry — and it is judged in windows, worst window first. */
async function longWalkWindows(windowFrames, windows) {
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1600)
  const collected = []
  for (let window = 0; window < windows; window += 1) {
    const part = await page.evaluate((count) => new Promise((done) => {
      const taken = []
      let hips = null
      window.__labScene.traverse((node) => {
        if (!hips && /Hips$/.test(node.name)) hips = node
      })
      const camera = window.__labCamera
      const Vector = Object.getPrototypeOf(hips.position).constructor
      const take = () => {
        const world = hips.getWorldPosition(new Vector())
        taken.push({ camera: [camera.position.x, camera.position.y, camera.position.z], hips: [world.x, world.y, world.z], time: performance.now() })
        if (taken.length >= count) done(taken)
        else requestAnimationFrame(take)
      }
      requestAnimationFrame(take)
    }), windowFrames)
    collected.push(part)
  }
  await page.keyboard.up('KeyW')
  return collected
}

const samples = await sampleWhileWalking(SAMPLE_FRAMES)
check('the lab rendered every frame that was asked for', samples.length === SAMPLE_FRAMES, `${samples.length}/${SAMPLE_FRAMES}`)

const world = evenness(stepsOf(samples, (sample) => sample.hips))
check(
  'the body moves evenly through the world',
  world.ratio <= MAX_UNEVENNESS && world.variation <= MAX_VARIATION,
  `worst frame ${world.ratio.toFixed(2)}x the median speed, variation ${world.variation.toFixed(3)}`,
)

/* @important Measured as a speed, not as an evenness. Evenness has a floor
   under it — too few samples above the moving threshold and it answers zero,
   which is a pass for the wrong reason, and a check that passes for the wrong
   reason is worse than no check. In a steady walk the body and the camera
   travel together, so the honest question is how fast they move APART. */
const relativeSpeeds = stepsOf(samples, (sample) => [
  sample.hips[0] - sample.camera[0],
  sample.hips[1] - sample.camera[1],
  sample.hips[2] - sample.camera[2],
]).sort((left, right) => left - right)
const worstRelative = relativeSpeeds[Math.floor(relativeSpeeds.length * 0.98)] ?? 0
check(
  'the body holds still against the camera, which is what the eye sees',
  relativeSpeeds.length > 100 && worstRelative <= MAX_RELATIVE_SPEED,
  `${relativeSpeeds.length} frames, worst ${worstRelative.toFixed(4)} m/s apart`,
)

/* @important The legs are sampled per rendered frame as well, relative to the
   hips. Measuring only the hips passed while the legs still ghosted: the body
   was interpolated between ticks and glided smoothly, but the animation phase
   only advanced when a tick ran, so the pose froze for a frame or two and then
   caught up — a staircase of leg motion laid over a smooth body. The signature
   is frames where a foot, relative to the hips, does not move at all between
   frames where it moves twice as far. */
function staircaseShare(samples, pick) {
  const steps = stepsOf(samples, (sample) => {
    const foot = pick(sample)
    return [foot[0] - sample.hips[0], foot[1] - sample.hips[1], foot[2] - sample.hips[2]]
  })
  const moving = steps.filter((step) => step > 0.02)
  if (moving.length < 20) return { frozen: 0, share: 0 }
  const median = [...moving].sort((a, b) => a - b)[Math.floor(moving.length / 2)]
  const frozen = steps.filter((step) => step < median * 0.15).length
  return { frozen, share: frozen / steps.length }
}

for (const [label, pick] of [['left', (sample) => sample.left], ['right', (sample) => sample.right]]) {
  const stairs = staircaseShare(samples, pick)
  check(
    `the ${label} leg moves every frame, not once a tick`,
    stairs.share <= MAX_FROZEN_SHARE,
    `${stairs.frozen} frozen frames, ${(stairs.share * 100).toFixed(1)}% of the walk`,
  )
}

const cameraSteps = evenness(stepsOf(samples, (sample) => sample.camera))
check(
  'the camera moves evenly',
  cameraSteps.ratio <= MAX_UNEVENNESS && cameraSteps.variation <= MAX_VARIATION,
  `worst frame ${cameraSteps.ratio.toFixed(2)}x the median, variation ${cameraSteps.variation.toFixed(3)}`,
)

await page.getByTestId('motion-reset').click().catch(() => undefined)
await page.keyboard.press('KeyH')
await page.getByTestId('motion-reset').click().catch(() => undefined)
await page.keyboard.press('KeyH')
await page.waitForTimeout(800)
const windows = await longWalkWindows(LONG_WINDOW_FRAMES, LONG_WINDOWS)
const perWindow = windows.map((part) => {
  const speeds = stepsOf(part, (sample) => [
    sample.hips[0] - sample.camera[0],
    sample.hips[1] - sample.camera[1],
    sample.hips[2] - sample.camera[2],
  ]).sort((left, right) => left - right)
  return speeds[Math.floor(speeds.length * 0.98)] ?? 0
})
const worstWindow = perWindow.reduce((worst, value, index) => (value > worst.value ? { index, value } : worst), { index: -1, value: 0 })
check(
  'the body holds still against the camera through a long walk, window by window',
  worstWindow.value <= MAX_RELATIVE_SPEED * 3,
  `worst window ${worstWindow.index} of ${perWindow.length}: ${worstWindow.value.toFixed(4)} m/s apart; all: ${perWindow.map((value) => value.toFixed(3)).join(' ')}`,
)

check('the page raised no errors', pageErrors.length === 0, pageErrors[0] ?? '')

await browser.close()

const failed = results.filter((result) => !result.pass)
console.log(failed.length === 0
  ? `\nall ${results.length} checks passed`
  : `\n${failed.length} of ${results.length} checks failed:\n  ${failed.map((result) => result.name).join('\n  ')}`)
process.exit(failed.length === 0 ? 0 : 1)
