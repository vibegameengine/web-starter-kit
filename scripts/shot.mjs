// Headed (visible-window) screenshot of the running dev app.
//
// AGENTS.md #1: headless is BANNED; a headed browser is the correct way to
// visually confirm how the scene looks. This launches a REAL Chromium window
// (headless: false), waits for shader warmup, hides the r3f-perf panel, and
// screenshots the canvas. Then READ the PNG and actually look at it.
//
//   npm run dev                                   # note the port
//   node scripts/shot.mjs [url] [outPath] [selector]
//
// Defaults: http://localhost:5173/  ->  docs/shots/latest.png, capturing the
// <canvas>. Pass a selector to shoot DOM instead — the UI-kit gallery has no
// canvas at all, and its previews are exactly the surfaces the kit's visual gate
// says must be looked at one at a time:
//
//   node scripts/shot.mjs http://localhost:5173/ui-kit/control-slider out.png '#root'

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3] ?? 'docs/shots/latest.png'
const selector = process.argv[4] ?? 'canvas'

await mkdir(dirname(out), { recursive: true })

const browser = await chromium.launch({ headless: false }) // visible window — never headless
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
})

// A blank capture is almost always a thrown render, and a screenshot cannot say
// so. Surfacing the page's own errors turns "the image is black" into the stack
// that caused it.
page.on('pageerror', (error) => console.log('  page error:', error.stack ?? error.message))
page.on('console', (message) => {
  if (message.type() === 'error') console.log('  console error:', message.text())
})

await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector(selector, { timeout: 30000 })
// A 3D scene needs the warmup and the perf panel hidden; a DOM page needs
// neither, and waiting seven seconds for it only makes the loop slower.
const is3d = selector === 'canvas'
await page.waitForTimeout(is3d ? 7000 : 1200)
if (is3d) {
  await page.keyboard.press('p') // hide the r3f-perf debug panel
  await page.waitForTimeout(600)
}

const target = await page.$(selector)
if (!target) throw new Error(`nothing matched ${selector} at ${url}`)
await target.screenshot({ path: out })
console.log('saved', out)

await browser.close()
