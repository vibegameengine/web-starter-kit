// One number for "how far off is it overall", tracked across rounds.
//
//   node harness/diff.js <ref.png> <attempt.png> [more.png ...]
//
// Mean absolute channel difference over every pixel, plus the share of pixels
// off by more than a visible threshold. Neither number tells you WHAT is wrong
// — that is the critics' job — but they tell you whether the round moved
// forward, which is the one thing a critic reading a single frame cannot know.
// Run it on every pass and keep the series in the round's critique file.
//
// A round where the defect list was applied and this number went UP is the
// loop overcorrecting, and it is a reason to reverse a change rather than
// stack another one on top of it.

const { analyse } = require('./lib');

const compare = (images, threshold) => {
  const [ref, ...rest] = images;
  return rest.map((img) => {
    if (img.width !== ref.width || img.height !== ref.height) {
      return { error: `size ${img.width}x${img.height} != reference ${ref.width}x${ref.height}` };
    }
    let sum = 0, bad = 0;
    for (let i = 0; i < ref.data.length; i += 4) {
      const d =
        (Math.abs(ref.data[i] - img.data[i]) +
          Math.abs(ref.data[i + 1] - img.data[i + 1]) +
          Math.abs(ref.data[i + 2] - img.data[i + 2])) / 3;
      sum += d;
      if (d > threshold) bad++;
    }
    const n = ref.data.length / 4;
    return { mad: +(sum / n).toFixed(2), pctOff: +((100 * bad) / n).toFixed(2) };
  });
};

(async () => {
  const files = process.argv.slice(2);
  const threshold = 24;
  if (files.length < 2) {
    console.error('usage: node diff.js <ref.png> <attempt.png> [more.png ...]');
    process.exit(2);
  }
  const rows = await analyse(files, compare, threshold);
  console.log(`reference: ${files[0]}`);
  rows.forEach((r, i) => {
    const name = files[i + 1].padEnd(28);
    if (r.error) console.log(`  ${name} ${r.error}`);
    else console.log(`  ${name} mean abs diff ${String(r.mad).padStart(6)}   pixels >${threshold}/255 off: ${r.pctOff}%`);
  });
  console.log('\n(a size mismatch means one of these was not rendered in the shipping frame)');
})();
