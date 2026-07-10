// Headed (visible-window) screenshot of the running dev app.
//
// AGENTS.md #1: headless is BANNED; a headed browser is the correct way to
// visually confirm how the scene looks. This launches a REAL Chromium window
// (headless: false), waits for shader warmup, hides the r3f-perf panel, and
// screenshots the canvas. Then READ the PNG and actually look at it.
//
//   npm run dev                                   # note the port
//   node scripts/shot.mjs [url] [outPath]
//
// Defaults: http://localhost:5173/  ->  docs/shots/latest.png

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3] ?? 'docs/shots/latest.png'

await mkdir(dirname(out), { recursive: true })

const browser = await chromium.launch({ headless: false }) // visible window — never headless
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
})

await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('canvas', { timeout: 30000 })
// Let ShaderWarmup finish, the bootstrap overlay dismiss, and frames settle.
await page.waitForTimeout(7000)
await page.keyboard.press('p') // hide the r3f-perf debug panel
await page.waitForTimeout(600)

const canvas = await page.$('canvas')
await canvas.screenshot({ path: out })
console.log('saved', out)

await browser.close()
