// Proves the responsive UI scaler still reacts to the viewport.
//
//   npm run dev
//   node scripts/verify-ui-scaler.mjs [baseUrl]
//
// Headed on purpose (AGENTS.md rule 1). It exists because `useCoarsePointer`
// and `useResponsiveTargetWidth` were moved off `useState` onto
// `useSyncExternalStore`, and a subscription that silently stops firing looks
// exactly like a layout that never needed to change: the HUD keeps its desktop
// scale on a phone and nothing reports a fault.
//
// Measured: 1500 px wide gives scale 1, 420 px gives 0.65625, widening puts it
// back. A dead subscription leaves all three identical.
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const results = []
const check = (name, pass, detail) => {
  results.push({ pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(5000)

const readScale = () =>
  page.evaluate(() => {
    const scaled = document.querySelector('[class*="scalable" i], [style*="scale"]')
    if (!scaled) return null
    const t = getComputedStyle(scaled).transform
    return { transform: t, width: scaled.getBoundingClientRect().width }
  })

const wide = await readScale()
check('HUD is scaled at desktop width', Boolean(wide), wide ? `${wide.transform}, ${Math.round(wide.width)}px` : 'no scaled element found')

await page.setViewportSize({ width: 420, height: 900 })
await page.waitForTimeout(1500)
const narrow = await readScale()
check(
  'a resize re-targets the scaler (the subscription is live)',
  Boolean(wide && narrow && wide.transform !== narrow.transform),
  narrow ? `${wide?.transform} -> ${narrow.transform}` : 'no scaled element after resize',
)

const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
check('coarse-pointer query is readable in this browser', typeof coarse === 'boolean', String(coarse))

await page.setViewportSize({ width: 1500, height: 950 })
await page.waitForTimeout(1200)
const back = await readScale()
check('it goes back when the window does', Boolean(back && wide && back.transform === wide.transform), back ? back.transform : 'n/a')

check('no page errors', errors.length === 0, errors[0] ?? 'clean')

await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
