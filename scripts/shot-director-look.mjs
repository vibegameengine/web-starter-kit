import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE_URL = (process.env.LAB_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const ROUTE = process.argv[2] ?? '/labs/director-look'
const OUT_DIR = process.env.SHOT_DIR ?? 'wip/director-look'
const VIEWPORT = { width: 1280, height: 800 }
const SETTLE_MS = 2500

const STEPS = [
  { name: '01-kit-default', settings: null },
  { name: '02-exposure-plus-one', settings: { look: { exposureEV: 1 } } },
  { name: '03-low-evening-sun', settings: { sun: { azimuthDeg: -20, elevationDeg: 12, color: '#ffb070', intensity: 3.2 } } },
  { name: '04-no-ambient', settings: { ambient: { indirectEV: -2 } } },
  { name: '05-agx-graded', settings: { look: { output: 'agx', saturation: 1.15, shadowLiftEV: 0.4, grain: 0.04 } } },
  { name: '06-imax-lens', settings: { camera: { preset: 'imax65-50', focalMm: 50 } } },
]

async function applySettings(page, settings) {
  await page.evaluate((next) => {
    const key = 'web-starter-kit:director:v1'
    if (next === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(next))
  }, settings)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: false, args: [`--window-size=${VIEWPORT.width + 40},${VIEWPORT.height + 140}`] })
  const page = await browser.newPage({ viewport: VIEWPORT })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('[shadows]')) errors.push(`${message.type()}: ${message.text()}`)
  })
  await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: 'load' })

  for (const step of STEPS) {
    await applySettings(page, step.settings)
    await page.screenshot({ path: `${OUT_DIR}/${step.name}.png` })
    console.log(`captured ${step.name}`)
  }

  await applySettings(page, null)
  await page.getByTestId('director-panel-toggle').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT_DIR}/07-panel-open.png` })
  console.log('captured 07-panel-open')

  console.log(errors.length === 0 ? 'console: clean' : `console:\n  ${errors.join('\n  ')}`)
  await browser.close()
}

await main()
