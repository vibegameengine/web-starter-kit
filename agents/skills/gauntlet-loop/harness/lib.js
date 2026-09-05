// Shared plumbing for the measurement tools.
//
// Everything decodes PNGs inside a real headless Chromium rather than with an
// image library. That is deliberate: the screenshot tool already needs a
// browser, so this keeps the harness at ONE dependency, and pixels are read
// back through exactly the same colour path they were written through.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function launch() {
  // Override only if you have a browser outside playwright's own cache.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXE;
  return chromium.launch(executablePath ? { executablePath } : {});
}

/**
 * Decode `files` in a headless browser and run `browserFn(images, arg)` there.
 * `images` is an array of { width, height, data } — data is RGBA, 4 bytes per
 * pixel, row-major. `browserFn` is serialised, so it may not close over
 * anything: pass what it needs in `arg`.
 */
async function analyse(files, browserFn, arg) {
  const b64s = files.map((f) => fs.readFileSync(path.resolve(f)).toString('base64'));
  const browser = await launch();
  try {
    const page = await browser.newPage();
    return await page.evaluate(
      async ({ b64s, src, arg }) => {
        const images = [];
        for (const s of b64s) {
          const img = new Image();
          img.src = 'data:image/png;base64,' + s;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          images.push({
            width: img.width,
            height: img.height,
            data: g.getImageData(0, 0, img.width, img.height).data,
          });
        }
        return (0, eval)('(' + src + ')')(images, arg);
      },
      { b64s, src: browserFn.toString(), arg },
    );
  } finally {
    await browser.close();
  }
}

/**
 * The shipping frame: viewport, device scale factor and crop that EVERY
 * verification render must use, so that every number anyone quotes is
 * comparable with every other. Taken from `--frame <path>` if given, else
 * `frame.json` beside the file being rendered, else its parent directory, else
 * the working directory. Nothing found falls back to a plain 1280x800 desktop
 * shot — which is a fine default and a bad bar, so write the file.
 */
function loadFrame(argv, nearFile) {
  const flagged = argv.indexOf('--frame');
  const candidates = [];
  if (flagged !== -1) candidates.push(argv[flagged + 1]);
  if (nearFile) {
    const dir = path.dirname(path.resolve(nearFile));
    candidates.push(path.join(dir, 'frame.json'), path.join(dir, '..', 'frame.json'));
  }
  candidates.push(path.resolve('frame.json'));
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return { source: c, ...JSON.parse(fs.readFileSync(c, 'utf8')) };
    }
  }
  return { source: 'default', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
}

/** `--flag value` from argv, or undefined. */
function flag(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

const nums = (s) => s.split(',').map(Number);

module.exports = { launch, analyse, loadFrame, flag, nums };
