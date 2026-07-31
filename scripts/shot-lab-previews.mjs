// Captures the preview frame for every DEV lab card in /labs.
//
// AGENTS.md #1: headless is BANNED. This drives a REAL Chromium window against
// the dev server you already have running (it never starts or stops one).
//
//   npm run dev                       # in another terminal; note the port
//   npm run labs:previews             # every lab
//   npm run labs:previews -- weapon-lab ragdoll-lab
//   LAB_BASE_URL=http://localhost:5176 npm run labs:previews
//
// The lab list comes from the index itself — the script reads the cards /labs
// rendered — so a newly registered lab is picked up with no edit here.

import { chromium } from 'playwright'
import { mkdir, open, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const BASE_URL = (process.env.LAB_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const OUT_DIR = path.resolve('src/app/ui/labs/previews')
const ONLY = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))

// 16:9, matching the card's aspect ratio so nothing is cropped in the grid.
const VIEWPORT = { height: 720, width: 1280 }
/** What the card actually needs, at 2x. The capture is downscaled to this. */
const CARD_WIDTH = 640
const CARD_HEIGHT = 360
/** Labs are heavy: shaders compile, worlds stream in, bootstrap dismisses. */
const SETTLE_MS = Number(process.env.LAB_SETTLE_MS ?? 9000)

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({
  args: ['--window-position=900,120', `--window-size=${VIEWPORT.width + 40},${VIEWPORT.height + 140}`],
  headless: false,
})

const failures = []
/**
 * Captured thumbnails, written only once the browser is gone.
 *
 * The index page displays every existing preview, and Chromium keeps those
 * files open for as long as it is running — so writing a lab's preview during
 * the run fails with a bare `UNKNOWN` on Windows for exactly the labs that
 * already HAD one. A first-time capture succeeds and a re-capture does not,
 * which reads as "that one lab is broken" rather than as a file lock.
 */
const pending = []
let captured = 0

try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: VIEWPORT })

  await page.goto(`${BASE_URL}/labs`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid^="labs-card-"]', { timeout: 30000 })

  const ids = await page.$$eval('[data-testid^="labs-card-"]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-testid').replace('labs-card-', '')),
  )
  const targets = ONLY.length > 0 ? ids.filter((id) => ONLY.includes(id)) : ids

  const missing = ONLY.filter((id) => !ids.includes(id))
  if (missing.length > 0) {
    console.warn(`! not registered, skipped: ${missing.join(', ')}`)
  }
  console.log(`${targets.length} lab(s) to capture from ${BASE_URL}\n`)

  for (const [index, id] of targets.entries()) {
    const label = `[${index + 1}/${targets.length}] ${id}`
    try {
      // A lab left running keeps simulating; a fresh page per lab keeps one
      // lab's load from being charged to the next one's frame.
      await page.goto(`${BASE_URL}/labs/${id}`, { waitUntil: 'load' })
      await page.waitForTimeout(SETTLE_MS)

      // Renderer-free labs (the meta/inventory/survival benches) have no canvas
      // and no perf panel — capture their DOM instead of failing them.
      if (await page.$('canvas')) {
        await page.keyboard.press('p') // hide the r3f-perf overlay
        await page.waitForTimeout(500)
      }

      // A card is ~268 px wide; shipping it a 1280 px PNG is 20x the pixels and
      // ~400 KB of committed repo per lab. 640 px covers a 2x display exactly.
      const shot = await page.screenshot({ type: 'png' })
      const thumb = await sharp(shot).resize(CARD_WIDTH, CARD_HEIGHT).webp({ quality: 80 }).toBuffer()
      // Held in memory, NOT written yet — see the write pass below.
      pending.push({ id, thumb })
      console.log(`${label} ✓`)
    } catch (error) {
      failures.push({ id, reason: error.message.split('\n')[0] })
      console.log(`${label} ✗ ${error.message.split('\n')[0]}`)
    }
  }
} finally {
  // Always ours, always closed by us — never by killing a browser process.
  await browser.close()
}

/**
 * Overwrites a preview IN PLACE rather than by truncating it.
 *
 * The dev server keeps the previews it has served open with a sharing mode that
 * allows reads and writes but denies truncation, so a plain overwrite — which
 * opens with `w`, i.e. truncate — fails on Windows with a bare `UNKNOWN` for
 * exactly the labs that already had a preview. A first capture works and every
 * re-capture does not, which reads as "that lab is broken" rather than as a
 * lock, and it is why several labs have sat on a stale preview.
 *
 * Opening `r+` and truncating through the handle is permitted, so that is what
 * this does; `w` remains the path for a preview that does not exist yet.
 */
async function writePreview(file, bytes) {
  let handle
  try {
    handle = await open(file, 'r+')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeFile(file, bytes)
    return
  }
  try {
    await handle.write(bytes, 0, bytes.length, 0)
    await handle.truncate(bytes.length)
  } catch (error) {
    throw describeLock(error)
  } finally {
    await handle.close()
  }
}

/**
 * Turns the bare `UNKNOWN` a locked preview produces into what it means.
 *
 * Once the dev server has SERVED a preview — which loading `/labs` in any
 * browser makes it do for every card at once — it holds that file for the rest
 * of its life. Measured on Windows against a running server: a same-size write
 * through an `r+` handle succeeds, but shrinking it fails `UNKNOWN`, replacing
 * it by `rename` fails `EPERM`, and deleting it fails `EBUSY`. Waiting does not
 * help; the lock is not a race, it lasts until the server restarts.
 *
 * So a re-capture of an already-served lab CANNOT succeed while that server is
 * up, and no amount of retrying inside this script will change that. This is the
 * whole reason "several labs have sat on a stale preview": the failure named a
 * file error, so it read as a broken lab rather than as a server to restart.
 *
 * And restarting the server is not enough on its own, which is the part that
 * wastes the most time: THIS SCRIPT opens `/labs` to read the lab list, and that
 * visit makes the brand-new server serve — and therefore lock — every preview
 * that still exists on disk. The only sequence that works is stop the server,
 * delete the stale files, start it again, re-run: with nothing on disk the write
 * takes the `ENOENT` path above and never needs to truncate anything.
 */
function describeLock(error) {
  if (!['EBUSY', 'EPERM', 'UNKNOWN'].includes(error.code)) return error
  return new Error(
    'preview is locked by the dev server (it has already served this file). '
    + 'A restart alone is NOT enough — this script opens /labs, which makes the '
    + 'fresh server serve every existing preview and lock it again. Stop the dev '
    + 'server, DELETE the stale .webp files, start it, then re-run.',
  )
}

for (const { id, thumb } of pending) {
  try {
    await writePreview(path.join(OUT_DIR, `${id}.webp`), thumb)
    captured += 1
  } catch (error) {
    failures.push({ id, reason: error.message.split('\n')[0] })
  }
}

console.log(`\n${captured} captured into ${path.relative(process.cwd(), OUT_DIR)}`)
if (failures.length > 0) {
  // Never silent: an uncaptured lab must stay visibly empty in the index.
  console.log(`${failures.length} failed and still have no preview:`)
  for (const { id, reason } of failures) console.log(`  ${id} — ${reason}`)
  process.exitCode = 1
}
