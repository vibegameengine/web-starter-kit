// Headed full-page screenshot (visible window). For the multi-viewport model viewer.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3] ?? 'docs/shots/page.png'
await mkdir(dirname(out), { recursive: true })

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1500, height: 640 }, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
console.log('saved', out, '| bbox', await page.evaluate(() => JSON.stringify(window.__bbox)))
await browser.close()
