// Proves the UI-kit gallery's Space-pan does not operate the preview it pans over,
// and that without Space the preview is still operable.
//
//   npm run dev
//   npm run verify:ui-kit-gallery     # or: node scripts/verify-ui-kit-gallery.mjs [baseUrl]
//
// Headed on purpose (AGENTS.md rule 1).
//
// Measured before the fix: a Space-drag begun over the master fader moved it
// from 0.85 to 0.1 AND panned the view. A native `<input type="range">` jumps to
// the pressed position on `pointerdown`, so a bubble-phase handler is already
// too late and suppressing the following `click` cannot undo a committed value.
// The two checks below are opposites on purpose: silencing the control during a
// pan is easy to do by breaking it for everyone, and the second check is what
// notices.
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const ROUTE = `${BASE}/ui-kit/audio-settings`

const results = []
const check = (name, pass, detail) => {
  results.push({ pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })

const readPan = () =>
  page.evaluate(() => {
    for (const element of document.querySelectorAll('div')) {
      const transform = element.style.transform
      if (transform && transform.includes('translate(')) return transform
    }
    return null
  })

const openFader = async () => {
  await page.goto(ROUTE, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  const fader = page.locator('input[data-testid="audio-master"]').first()
  if (!(await fader.count())) throw new Error('the master fader is not on this route')
  return fader
}

// --- a pan that starts over the fader must not touch it ----------------------
let fader = await openFader()
let before = await fader.inputValue()
let box = await fader.boundingBox()
const panBefore = await readPan()

// Space is ignored while focus sits in a form control (see isTyping in the
// gallery), so park focus on the canvas first and make the gesture the only
// variable.
await page.mouse.click(1200, 820)
await page.waitForTimeout(200)
await page.keyboard.down('Space')
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width * 0.2 - 120, box.y + box.height / 2 - 60, { steps: 12 })
await page.mouse.up()
await page.keyboard.up('Space')
await page.waitForTimeout(400)

const afterPan = await fader.inputValue()
const panAfter = await readPan()
check('a Space-pan over the fader leaves its value alone', before === afterPan, `${before} -> ${afterPan}`)
check('and it still pans', panBefore !== panAfter, `${panBefore} -> ${panAfter}`)

// --- without Space the fader is still a fader --------------------------------
fader = await openFader()
before = await fader.inputValue()
box = await fader.boundingBox()

await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(300)

const afterClick = await fader.inputValue()
check('without Space the fader still moves', before !== afterClick, `${before} -> ${afterClick}`)

await browser.close()
const failed = results.filter((result) => !result.pass).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
