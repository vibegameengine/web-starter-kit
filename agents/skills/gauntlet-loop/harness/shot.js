// Render the attempt in the SHIPPING frame and report anything that went wrong
// while doing it.
//
//   node harness/shot.js <file-or-url> <out.png> [--frame frame.json]
//                        [--selector '#card'] [--wait 400]
//
// The frame (viewport, device scale factor, crop) comes from frame.json, not
// from flags you might forget — see lib.js. Console errors and failed requests
// are printed with the shot, because a render that logged four 404s is not a
// render you can critique.

const path = require('path');
const { launch, loadFrame, flag } = require('./lib');

(async () => {
  const [target, out] = process.argv.slice(2);
  if (!target || !out) {
    console.error('usage: node shot.js <file-or-url> <out.png> [--frame f.json] [--selector SEL]');
    process.exit(2);
  }
  const frame = loadFrame(process.argv, target);
  const wait = Number(flag(process.argv, '--wait') ?? frame.waitMs ?? 400);
  const selector = flag(process.argv, '--selector') ?? frame.selector;

  const browser = await launch();
  const page = await browser.newPage({
    viewport: frame.viewport,
    deviceScaleFactor: frame.deviceScaleFactor,
  });

  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('requestfailed', (r) => errors.push('REQFAIL ' + r.url()));

  const url = /^https?:|^file:/.test(target) ? target : 'file://' + path.resolve(target);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);

  // Optional: report a landmark element's box, so a layout critic can quote a
  // number that came from the DOM rather than from counting pixels.
  let box = null;
  if (selector) {
    const el = await page.$(selector);
    box = el ? await el.boundingBox() : `NOT FOUND: ${selector}`;
  }

  await page.screenshot({ path: out, clip: frame.clip });
  console.log(JSON.stringify({ out, frame: frame.source, box, errors }, null, 2));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
