# The harness

Four tools and a screenshot command. Everything a critic needs to obey "demand
numbers", and everything a builder needs to verify in the shipping frame.

They are here because the process did not work without them. An agent given only
this repository had to write all four before a single critic could satisfy a
brief that says "our midtones are rgb(93,97,78), the reference is
rgb(136,95,77)". These are that agent's tools, generalised. A worked example of
each in use is in [`../example/`](../example/).

```
cd harness
npm install
npx playwright install chromium
```

One dependency. All four decode PNGs inside the same headless browser that takes
the screenshots, so pixels are read back through the same colour path they were
written through.

## `frame.json` — the shipping frame

Not a tool; a file, and the most important thing here. It fixes viewport, device
scale factor and crop for **every** render, so that any number any critic quotes
is comparable with any number any other critic quotes.

```json
{
  "viewport": { "width": 1280, "height": 900 },
  "deviceScaleFactor": 2,
  "clip": { "x": 90, "y": 350, "width": 550, "height": 300 },
  "selector": "#card",
  "waitMs": 400
}
```

`shot.js` looks for it beside the file being rendered, then in that file's parent
directory, then in the working directory, then falls back to a plain 1280x800
shot. Write the file. A reference captured portrait on a phone and an attempt
captured wide on a desktop produce two people confidently disagreeing about a
layout neither of them has seen.

## `shot.js` — render in the shipping frame

```
node harness/shot.js <file-or-url> <out.png> [--frame f.json] [--selector '#el'] [--wait 400]
```

Prints the frame it used, the bounding box of `selector` if given, and every
console error and failed request. **Exits non-zero if there were any** — a render
that logged four 404s is not a render anyone should be critiquing. Give this
command verbatim to every critic and every builder.

## `probe.js` — colour at a point

```
node harness/probe.js <png> 30,30 600,100 200,500
```

Coordinates are the PNG's own device pixels: at `deviceScaleFactor: 2` that is
twice the CSS number. Sample the *same* coordinate in the reference and in the
attempt and quote both.

## `bbox.js` — where a feature is, and how far off

```
node harness/bbox.js <ref.png> [attempt.png ...] --queries queries.json --dsf 2
node harness/bbox.js <ref.png> <ours.png> --rgb 10,37,64 --tol 30 --region 0,0,550,160
```

A query is "every pixel within `tol` of this colour inside this region, and the
box they occupy". Pass the reference **first** and each attempt after it, and
every attempt prints with its delta from the reference. Those deltas are the
critique: a button 42 px too high stops being a matter of taste.

`queries.json` is an array of `{ name, rgb, tol, region }`. Keep it with the run
and review it like any other part of the bar — it is the written-down claim about
*which* features have to match, and a badly-scoped region produces a confident,
wrong number.

## `scan.js` — runs of flat colour along a line

```
node harness/scan.js <png> h:400 v:120 [--min 4]
```

`h:400` reads row y=400, `v:120` reads column x=120. This is how you measure the
things nobody drew a box around: the true edge of a card, the width of a gutter,
where a gradient stops, whether a 4 px inset is 4 px on all four sides. Use it on
the **reference, before building** — that is what turns the first attempt into
something arguable rather than decorative.

## `diff.js` — one number, tracked across rounds

```
node harness/diff.js <ref.png> <attempt.png> [more.png ...]
```

Mean absolute channel difference plus the share of pixels off by more than a
visible threshold. It does not tell you what is wrong. It tells you whether the
round moved forward, which is the one thing a critic reading a single frame
cannot know. **A round where the whole defect list was applied and this number
went up is the loop overcorrecting** — a reason to reverse a change rather than
stack another on top of it.

A size mismatch is reported as an error rather than a number, because it means
one of the two was not rendered in the shipping frame.

## If your artefact is not pixels

Then these tools are not yours, and the contract they exist to serve still is.
A critic's finding needs a measurement, a comparison against the reference, and
a value to write. Substitute in kind: a count with a denominator ("12 of the 17
required fields are present"), a diff, a latency, a byte size, a coverage
percentage, a schema validator's output. Whatever it is, **the critic must state
the command it ran**, so the builder can rerun it and see the same number.
