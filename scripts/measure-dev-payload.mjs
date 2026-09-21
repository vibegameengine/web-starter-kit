/*
 * What a cold browser has to pull out of the dev server for one route.
 *
 * The number that matters on a transcontinental link is REQUESTS, not bytes:
 * unbundled ESM means one round trip per module, and at 250 ms RTT a thousand
 * modules is minutes of waiting however small each one is. Bytes on the wire and
 * sourcemap weight are reported beside it because they are what compression and
 * the sourcemap strip move.
 *
 * `networkidle` is NOT usable as the stop condition here: the bootstrap gate
 * fetches its assets after the entry has already settled, so the page would be
 * declared finished before the game had asked for anything. The run stops after
 * a fixed quiet period with no response at all.
 *
 * Usage: node scripts/measure-dev-payload.mjs [url] [label]
 * Expects a dev server already listening on that origin.
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173/'
const label = process.argv[3] ?? url
const QUIET_MS = 6000
const HARD_LIMIT_MS = 300_000

const browser = await chromium.launch()
// A cold cache is the case being measured: somebody on the other side of the
// planet opening the link for the first time.
const context = await browser.newContext()
const page = await context.newPage()

let requests = 0
let wireBytes = 0
let sourcemapBytes = 0
const byKind = new Map()
let lastResponseAt = Date.now()
const pending = []

page.on('response', (response) => {
  requests += 1
  lastResponseAt = Date.now()
  const responseUrl = response.url()
  pending.push(
    (async () => {
      let size = 0
      let mapBytes = 0
      try {
        // `body()` is the decoded body; the header is what actually crossed the
        // wire once the transport plugin has compressed it.
        const body = await response.body()
        const declared = Number(response.headers()['content-length'] ?? '')
        size = Number.isFinite(declared) && declared > 0 ? declared : body.length
        // Vite serves dev sourcemaps INLINE, as a base64 data URL appended to
        // the module, so those bytes never appear as a `.map` request.
        const marker = body.lastIndexOf(Buffer.from('sourceMappingURL=data:'))
        if (marker !== -1) mapBytes = body.length - marker
      } catch {
        size = 0
      }
      wireBytes += size
      sourcemapBytes += mapBytes
      const kind = /\/node_modules\/\.vite\/deps\//.test(responseUrl)
        ? 'deps (prebundled)'
        : /\/assets\/.*\.js(\?|$)/.test(responseUrl)
          ? 'bundle chunks'
          : /\/src\/|\/@fs\//.test(responseUrl)
            ? 'src modules'
            : /\/@(glb-optimizer|fbx-loader|imagetools)\//.test(responseUrl)
              ? 'game assets'
              : 'other'
      const entry = byKind.get(kind) ?? { count: 0, bytes: 0 }
      entry.count += 1
      entry.bytes += size
      byKind.set(kind, entry)
    })(),
  )
})

const started = Date.now()
await page.goto(url, { timeout: 120_000, waitUntil: 'load' })
while (Date.now() - lastResponseAt < QUIET_MS && Date.now() - started < HARD_LIMIT_MS) {
  await page.waitForTimeout(500)
}
await Promise.all(pending)
const elapsed = Date.now() - started

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`
console.log(`\n== ${label} ==`)
console.log(`requests      ${requests}`)
console.log(`on the wire   ${mb(wireBytes)}`)
console.log(`sourcemaps    ${mb(sourcemapBytes)} (inline, inside the JS above)`)
console.log(`settled after ${(elapsed / 1000).toFixed(1)} s (localhost — not a WAN figure)`)
for (const [kind, entry] of [...byKind].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${kind.padEnd(20)} ${String(entry.count).padStart(5)} req  ${mb(entry.bytes)}`)
}

await browser.close()
