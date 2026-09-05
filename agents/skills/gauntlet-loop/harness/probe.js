// What colour is it, actually?
//
//   node harness/probe.js <png> x,y [x,y ...]
//
// The critic contract is "demand numbers": not "too dark" but "our midtones are
// rgb(93,97,78), the reference is rgb(136,95,77)". This is how both halves of
// that sentence are obtained. Coordinates are in the PNG's own device pixels —
// on a deviceScaleFactor:2 shot that is twice the CSS number.

const { analyse } = require('./lib');

(async () => {
  const [png, ...pts] = process.argv.slice(2);
  if (!png || !pts.length) {
    console.error('usage: node probe.js <png> x,y [x,y ...]');
    process.exit(2);
  }
  const out = await analyse(
    [png],
    ([img], pts) => ({
      size: [img.width, img.height],
      samples: pts.map(([x, y]) => {
        // Silently returning undefined here would hand a critic a confident,
        // meaningless number. Coordinates are device px, not CSS px, and
        // getting that wrong is the usual reason a point lands outside.
        if (!(x >= 0 && y >= 0 && x < img.width && y < img.height)) {
          return { at: [x, y], error: `outside the image (${img.width}x${img.height} device px)` };
        }
        const i = (y * img.width + x) * 4;
        return { at: [x, y], rgb: `rgb(${img.data[i]},${img.data[i + 1]},${img.data[i + 2]})` };
      }),
    }),
    pts.map((s) => s.split(',').map(Number)),
  );
  console.log(JSON.stringify(out, null, 2));
})();
