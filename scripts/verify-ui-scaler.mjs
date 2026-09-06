// Proves the responsive HUD target width still follows the viewport.
//
//   npm run dev
//   npm run verify:ui-scaler        # or: node scripts/verify-ui-scaler.mjs [baseUrl]
//
// Headed on purpose (AGENTS.md rule 1).
//
// WHAT THIS HAS TO DISTINGUISH, and why the obvious check does not.
//
// `useResponsiveTargetWidth` chooses the TARGET width — 1280 on a desktop, 640
// on a phone in portrait — and `ScalableContainer` turns that into a scale with
// its own `resize` listener: `min(1, innerWidth / target)`. So the scale moves
// when the window moves WHETHER OR NOT this hook's subscription is alive, and a
// check that only asserts "the scale changed" passes with the hook dead. The
// first version of this script did exactly that, and was measured passing 5/5
// against a subscription stubbed out to do nothing.
//
// The subscription is only visible in the NUMBER:
//
//   420 px, target re-picked to 640   ->  min(1, 420/640)  = 0.65625   (alive)
//   420 px, target stuck at 1280      ->  min(1, 420/1280) = 0.328125  (dead)
//
// So this asserts the numbers, and nothing else here is worth asserting.
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'

/** min(1, 1500/1280) — the desktop target is wider than the window is. */
const DESKTOP_SCALE = 1
/** min(1, 420/640) — only reachable if the portrait target was picked up. */
const PORTRAIT_SCALE = 0.65625
/** min(1, 420/1280) — what a dead subscription leaves behind. */
const STUCK_SCALE = 0.328125

const results = []
const check = (name, pass, detail) => {
  results.push({ pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errors = []
page.on('pageerror', (event) => errors.push(String(event)))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(5000)

/**
 * The scale ScalableContainer applied, read off the element it applied it to.
 * It carries no class or test id of its own, so it is found by the two inline
 * properties it always sets together.
 */
const readScale = () =>
  page.evaluate(() => {
    for (const element of document.querySelectorAll('div')) {
      // `transformOrigin` comes back normalised as "left top", not the "top
      // left" the component writes — match on the transform instead.
      const match = /^scale\(([\d.]+)\)$/.exec(element.style.transform)
      if (match) return Number(match[1])
    }
    return null
  })

const wide = await readScale()
check(`desktop width scales ${DESKTOP_SCALE}`, wide === DESKTOP_SCALE, `scale ${wide}`)

await page.setViewportSize({ width: 420, height: 900 })
await page.waitForTimeout(1500)
const narrow = await readScale()
check(
  `portrait re-picks the 640 target (scale ${PORTRAIT_SCALE})`,
  narrow === PORTRAIT_SCALE,
  narrow === STUCK_SCALE
    ? `scale ${narrow} — the target stayed at 1280: the viewport subscription is dead`
    : `scale ${narrow}`,
)

await page.setViewportSize({ width: 1500, height: 950 })
await page.waitForTimeout(1200)
const back = await readScale()
check(`widening restores ${DESKTOP_SCALE}`, back === DESKTOP_SCALE, `scale ${back}`)

check('no page errors', errors.length === 0, errors[0] ?? 'clean')

await browser.close()
const failed = results.filter((result) => !result.pass).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
