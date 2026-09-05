// Where is that thing, exactly, and where is it in the reference?
//
//   node harness/bbox.js <ref.png> [attempt.png ...] --queries queries.json [--dsf 2]
//   node harness/bbox.js <ref.png> [attempt.png ...] --rgb 10,37,64 [--tol 30]
//                                  [--region x0,y0,x1,y1] [--name heading]
//
// A query is "find every pixel within `tol` of this colour inside this region,
// and give me the box they occupy". That is enough to locate almost any feature
// worth arguing about: a heading's ink, a button, a panel fill, a road's
// silhouette against sky.
//
// Pass the reference FIRST and the attempts after it, and each attempt is
// printed with its delta from the reference. Those deltas are the critique: a
// button 42 px too high stops being a matter of taste.
//
// queries.json is an array of:
//   { "name": "heading ink", "rgb": [10,37,64], "tol": 30, "region": [0,0,550,160] }
// `region` is [x0,y0,x1,y1] in device pixels and may be omitted for the whole
// image. Keep the file next to the run: the query list IS the definition of
// "the features we are matching", and it should be reviewed like any other
// part of the bar.

const fs = require('fs');
const { analyse, flag, nums } = require('./lib');

const measure = (images, queries) =>
  images.map((img) =>
    queries.map((q) => {
      const [x0, y0, x1, y1] = q.region || [0, 0, img.width, img.height];
      const tol = q.tol ?? 30;
      let mnx = Infinity, mny = Infinity, mxx = -1, mxy = -1, n = 0;
      for (let y = y0; y < Math.min(y1, img.height); y++) {
        for (let x = x0; x < Math.min(x1, img.width); x++) {
          const i = (y * img.width + x) * 4;
          if (
            Math.abs(img.data[i] - q.rgb[0]) <= tol &&
            Math.abs(img.data[i + 1] - q.rgb[1]) <= tol &&
            Math.abs(img.data[i + 2] - q.rgb[2]) <= tol
          ) {
            n++;
            if (x < mnx) mnx = x;
            if (x > mxx) mxx = x;
            if (y < mny) mny = y;
            if (y > mxy) mxy = y;
          }
        }
      }
      return { name: q.name, px: n, box: n ? [mnx, mny, mxx - mnx + 1, mxy - mny + 1] : null };
    }),
  );

(async () => {
  const argv = process.argv.slice(2);
  const files = argv.filter((a) => /\.png$/i.test(a) && !argv[argv.indexOf(a) - 1]?.startsWith('--'));
  const qfile = flag(argv, '--queries');
  const dsf = Number(flag(argv, '--dsf') ?? 1);
  const queries = qfile
    ? JSON.parse(fs.readFileSync(qfile, 'utf8'))
    : [
        {
          name: flag(argv, '--name') || 'query',
          rgb: nums(flag(argv, '--rgb') || ''),
          tol: Number(flag(argv, '--tol') ?? 30),
          region: flag(argv, '--region') ? nums(flag(argv, '--region')) : undefined,
        },
      ];
  if (!files.length || !queries[0].rgb?.length) {
    console.error('usage: node bbox.js <ref.png> [attempt.png ...] (--queries q.json | --rgb r,g,b)');
    process.exit(2);
  }

  const results = await analyse(files, measure, queries);
  const unit = dsf === 1 ? 'px' : `px/${dsf} (CSS)`;
  const fmt = (b) => (b ? '[' + b.map((v) => +(v / dsf).toFixed(1)).join(',') + ']' : 'NOT FOUND');

  results.forEach((rows, f) => {
    console.log(`\n${files[f]}${f === 0 ? '   (reference)' : ''}   x,y,w,h in ${unit}`);
    rows.forEach((r, q) => {
      const ref = results[0][q];
      let delta = '';
      if (f > 0 && r.box && ref.box) {
        const d = r.box.map((v, i) => +((v - ref.box[i]) / dsf).toFixed(1));
        delta = d.every((v) => v === 0) ? '   exact' : `   delta [${d}]`;
      }
      console.log('  ' + r.name.padEnd(32) + ' n=' + String(r.px).padStart(7) + '  ' + fmt(r.box) + delta);
    });
  });
})();
