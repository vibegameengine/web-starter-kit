// Read an image along one line and print the runs of flat colour.
//
//   node harness/scan.js <png> h:400 v:120 [--min 4]
//
// `h:400` scans row y=400 left to right; `v:120` scans column x=120 top to
// bottom. Output is the runs longer than `--min` pixels, as [start, end, rgb].
//
// This is the tool for measuring things nobody drew a box around: the true edge
// of a card, the width of a gutter, where a gradient actually stops, whether
// the 4 px inset is 4 px on all four sides. It is how the worked example's
// reference table was built before a single line of the recreation existed —
// and measuring the reference BEFORE building is what makes the first attempt
// arguable instead of decorative.

const { analyse, flag } = require('./lib');

const scan = (images, { lines, min }) => {
  const img = images[0];
  const key = (x, y) => {
    const i = (y * img.width + x) * 4;
    return `rgb(${img.data[i]},${img.data[i + 1]},${img.data[i + 2]})`;
  };
  const out = {};
  for (const line of lines) {
    const [kind, fixedRaw] = line.split(':');
    const fixed = Number(fixedRaw);
    const along = kind === 'h' ? img.width : img.height;
    const runs = [];
    let prev = null, start = 0;
    for (let i = 0; i < along; i++) {
      const k = kind === 'h' ? key(i, fixed) : key(fixed, i);
      if (k !== prev) {
        if (prev !== null && i - start > min) runs.push([start, i - 1, prev]);
        prev = k;
        start = i;
      }
    }
    if (along - start > min) runs.push([start, along - 1, prev]);
    out[line] = runs;
  }
  return out;
};

(async () => {
  const argv = process.argv.slice(2);
  const png = argv[0];
  const lines = argv.slice(1).filter((a) => /^[hv]:\d+$/.test(a));
  const min = Number(flag(argv, '--min') ?? 3);
  if (!png || !lines.length) {
    console.error('usage: node scan.js <png> h:400 v:120 [--min 4]');
    process.exit(2);
  }
  const out = await analyse([png], scan, { lines, min });
  for (const [line, runs] of Object.entries(out)) {
    console.log(`\n${line}  (runs longer than ${min}px, device coords)`);
    for (const [a, b, rgb] of runs) console.log(`  ${String(a).padStart(5)}..${String(b).padEnd(5)} ${String(b - a + 1).padStart(5)}px  ${rgb}`);
  }
})();
