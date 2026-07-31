// Drives every verb of the ragdoll lab in a REAL browser window and captures a
// frame per verb: standing, knocked out, dragged, flung, spun, and pelted with
// shapes.
//
// AGENTS.md #1: headless is BANNED. This drives a visible Chromium against the
// dev server you already have running (it never starts or stops one).
//
//   npm run dev -- --port 5180 --strictPort     # in another terminal
//   node scripts/shot-ragdoll-lab.mjs
//   RAGDOLL_BASE_URL=http://localhost:5173 node scripts/shot-ragdoll-lab.mjs
//
// The body is located by COLOUR rather than by a hard-coded pixel: the mannequin
// is the only warm-orange thing in a cold grey frame, so the centroid of its
// pixels is where it is drawn. A guessed coordinate silently drags empty air and
// the run still "passes" — this cannot, because if the body is not on screen
// there is no centroid to drag from.

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const BASE_URL = (process.env.RAGDOLL_BASE_URL ?? 'http://localhost:5180').replace(/\/$/, '')
const OUT_DIR = path.resolve('docs/shots/ragdoll-lab')
const VIEWPORT = { height: 760, width: 1280 }

/** The mannequin's material, and the thrown shapes' — both from source. */
const BODY_RGB = [0xb9, 0x74, 0x3f]
const SHAPE_RGB = [0x7f, 0x93, 0xa8]
/** Tone mapping shifts every channel, so the match has to be generous. */
const BODY_TOLERANCE = 46
const SHAPE_TOLERANCE = 30

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({
  args: ['--window-position=60,40', `--window-size=${VIEWPORT.width + 20},${VIEWPORT.height + 120}`],
  headless: false,
})
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: VIEWPORT })

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

/**
 * Pixels of one material in the current frame: how many, and where their centre
 * is. Used both to FIND the body and to prove a shape actually arrived.
 *
 * The HUD is CUT OUT of the search. The panel is drawn in the same amber-orange
 * family as the mannequin, so with it included the centroid lands between the
 * panel and the body — on empty ground. A drag aimed there grabs nothing, and the
 * run still reports a body on screen, because there is one; just not where it
 * said. That failure cost a whole verification pass.
 */
async function findMaterial(buffer, [r, g, b], tolerance, exclude = null) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  let sumX = 0
  let sumY = 0
  for (let index = 0; index < data.length; index += info.channels) {
    if (
      Math.abs(data[index] - r) > tolerance ||
      Math.abs(data[index + 1] - g) > tolerance ||
      Math.abs(data[index + 2] - b) > tolerance
    ) {
      continue
    }
    const pixel = index / info.channels
    const x = pixel % info.width
    const y = Math.floor(pixel / info.width)
    if (
      exclude &&
      x >= exclude.x &&
      x <= exclude.x + exclude.width &&
      y >= exclude.y &&
      y <= exclude.y + exclude.height
    ) {
      continue
    }
    count += 1
    sumX += x
    sumY += y
  }
  if (count === 0) return { count: 0, x: null, y: null }
  return { count, x: Math.round(sumX / count), y: Math.round(sumY / count) }
}

/** The panel's rectangle, refreshed each time: it is hidden for some frames. */
async function hudBox() {
  return await page.locator('[data-testid="ragdoll-hud"]').boundingBox().catch(() => null)
}

const report = []

async function capture(name, note) {
  const buffer = await page.screenshot()
  const panel = await hudBox()
  await writeFile(path.join(OUT_DIR, `${name}.png`), buffer)
  const body = await findMaterial(buffer, BODY_RGB, BODY_TOLERANCE, panel)
  const shapes = await findMaterial(buffer, SHAPE_RGB, SHAPE_TOLERANCE, panel)
  const span = await page.evaluate(() => globalThis.__ragdollSpan ?? null)
  const row = {
    bodyPixels: body.count,
    bodyAt: body.x === null ? null : `${body.x},${body.y}`,
    drawnY: span?.drawnY ?? null,
    name,
    note,
    shapePixels: shapes.count,
    spanY: span?.spanY ?? null,
  }
  report.push(row)
  console.log(
    `${name.padEnd(22)} body=${String(row.bodyPixels).padStart(6)} at ${String(row.bodyAt).padEnd(9)}` +
      ` shapes=${String(row.shapePixels).padStart(5)} drawnY=${String(row.drawnY).padStart(6)} spanY=${row.spanY}`,
  )
  return { body, shapes }
}

/** The reset button, so every verb starts from a body standing on its feet. */
async function standUp() {
  await page.click('[data-testid="ragdoll-reset"]')
  // Clicking the panel leaves the pointer on the panel. Park it back over the
  // canvas, well clear of the controls, or the next cursor-aimed action (a shot, a
  // throw) is aimed at wherever the button was.
  await page.mouse.move(VIEWPORT.width - 120, 120)
  await page.waitForTimeout(1200)
}

/** Where the body is drawn right now, by colour. Null if it is not in frame. */
async function locateBody() {
  const found = await findMaterial(await page.screenshot(), BODY_RGB, BODY_TOLERANCE, await hudBox())
  return found.count === 0 ? null : found
}

await page.goto(`${BASE_URL}/labs/ragdoll-lab`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ready === true, { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(4000)

const standing = await capture('01-standing', 'body upright on the shared lab stage')
if (standing.body.count === 0) {
  console.error('FAIL: no body pixels in the first frame — nothing below can be trusted.')
  await browser.close()
  process.exit(1)
}

// --- knocked out ----------------------------------------------------------
await page.click('[data-testid="ragdoll-knockout"]')
await page.waitForTimeout(2600)
await capture('02-knocked-out', 'K / Вырубить: collapses under gravity alone')

// --- grabbed and dragged --------------------------------------------------
await standUp()
const grabTarget = await locateBody()
if (!grabTarget) {
  console.error('FAIL: body not on screen before the grab.')
  await browser.close()
  process.exit(1)
}
// The centroid sits at the middle of the mass; aim a little above it for a
// shoulder or an arm, which is what you would actually take hold of.
const grabX = grabTarget.x
const grabY = Math.max(40, grabTarget.y - 60)
await page.mouse.move(grabX, grabY)
await page.mouse.down()
await page.waitForTimeout(500)
// Hauled up and across, in steps: one jump would move the anchor a metre between
// two solver steps and the joint would simply snap the limb there.
for (const [dx, dy] of [
  [40, -60],
  [90, -110],
  [150, -150],
  [210, -170],
]) {
  await page.mouse.move(grabX + dx, grabY + dy)
  await page.waitForTimeout(160)
}
await capture('03-dragged', 'ЛКМ drag: the limb follows the cursor, camera held still')

// --- flung on release -----------------------------------------------------
// Whipped sideways first, so letting go throws the body instead of dropping it.
for (const [dx, dy] of [
  [120, -170],
  [10, -160],
  [-90, -150],
]) {
  await page.mouse.move(grabX + dx, grabY + dy)
  await page.waitForTimeout(70)
}
await page.mouse.up()
await page.waitForTimeout(900)
await capture('04-flung', 'released mid-swing: the body keeps the drag velocity')

// --- spun -----------------------------------------------------------------
await standUp()
await page.click('[data-testid="ragdoll-spin"]')
await page.waitForTimeout(120)
await page.click('[data-testid="ragdoll-spin"]')
await page.waitForTimeout(700)
await capture('05-spun', 'Раскрутить: torque impulse about the vertical axis')

// --- tumbled --------------------------------------------------------------
await standUp()
await page.click('[data-testid="ragdoll-tumble"]')
await page.waitForTimeout(900)
await capture('06-tumbled', 'Кувырок: torque about the camera right axis')

// --- launched -------------------------------------------------------------
await standUp()
await page.click('[data-testid="ragdoll-launch"]')
await page.waitForTimeout(700)
await capture('07-launched', 'Запустить: whole body flung away from the camera')

// --- pelted with shapes ---------------------------------------------------
await standUp()
for (const shape of ['sphere', 'box', 'capsule', 'cylinder']) {
  await page.click(`[data-testid="shape-${shape}"]`)
  // Thrown with the KEY, not the button: the throw goes at the cursor, and a
  // click leaves the cursor on the panel. Aim at the body as it is drawn NOW —
  // by the time the fourth shape is picked, earlier hits have moved it.
  const here = (await locateBody()) ?? grabTarget
  await page.mouse.move(here.x, here.y)
  await page.waitForTimeout(120)
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(320)
}
await capture('08-shapes-thrown', 'Throw: four solids in flight toward the body')
// And once they have landed: the body is limp, so a thrown shape actually hits it.
await page.waitForTimeout(1600)
const pelted = await capture('08b-shapes-landed', 'the body down, the shapes around it')

// --- collider wireframes --------------------------------------------------
await page.click('[data-testid="ragdoll-debug"]')
await page.waitForTimeout(700)
await capture('09-colliders', 'Коллайдеры: rapier capsules and joints over the mesh')

// --- zero gravity ---------------------------------------------------------
await page.click('[data-testid="ragdoll-debug"]')
await page.click('[data-testid="gravity-zero"]')
await standUp()
await page.click('[data-testid="ragdoll-spin"]')
await page.waitForTimeout(1500)
await capture('10-zero-gravity-spin', 'Zero gravity: the spin plays out without the floor')

// --- the frame with nothing in the way ------------------------------------
await page.click('[data-testid="gravity-earth"]')
await standUp()
await page.keyboard.press('KeyH')
await page.waitForTimeout(400)
await capture('11-clean-standing', 'H: panel hidden, the frame a preview would use')
await page.keyboard.press('KeyK')
await page.waitForTimeout(2600)
await capture('12-clean-settled', 'the settled body with no controls over it')

await writeFile(path.join(OUT_DIR, 'report.json'), `${JSON.stringify({ consoleErrors, report }, null, 2)}\n`)

console.log('')
if (pelted.shapes.count === 0) console.error('FAIL: no thrown shapes visible in the frame.')
if (consoleErrors.length > 0) {
  console.error(`console errors (${consoleErrors.length}):`)
  for (const error of consoleErrors.slice(0, 10)) console.error(`  ${error}`)
} else {
  console.log('console: clean')
}
console.log(`frames in ${OUT_DIR}`)

await browser.close()
