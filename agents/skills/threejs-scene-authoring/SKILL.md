---
name: threejs-scene-authoring
description: >-
  How to BUILD / lay out Three.js / react-three-fiber scenes in this project.
  MANDATORY whenever placing, composing, arranging, or "dressing" scene geometry
  — buildings, props, trees/cones, ruins, terrain features, colored figures,
  level layout, greybox/blockout. Enforces the project's absolute rule (AGENTS.md
  #3): scenes are ALWAYS authored by hand — no RNG scatter, no seeded generators,
  no `range()`/random placement, no "spawn N from a loop to fill space". Every
  element is placed deliberately to serve a composition/reference, and EVERY step
  is confirmed with a headed (visible-window) screenshot before moving on.
  Trigger on: "build the scene", "lay out", "place", "arrange", "compose",
  "match the reference", "dress the set", "add buildings/trees/props", "the scene
  looks…", scene/level construction of any kind. Pairs with
  threejs-instancing-materials (draw calls) and threejs-scene-architecture
  (frame cost / static-dynamic).
---

# Scene authoring — hand-placed, reference-driven, visually verified

**Absolute rule (AGENTS.md #3): never build a scene procedurally.** No
`makeRng`, no `range(lo,hi)` positions, no `for` loop that scatters objects to
"fill" an area. A random scatter looks random — flat, characterless, accidental.
Authored scenes read as *designed*: every block, cone and ruin is where it is for
a reason. This is the difference between a tech demo and a place.

## The loop (do this for every element or small group)

1. **Look at the reference.** Name what you see as discrete elements and their
   ROLE: focal point, framing mass, midground cluster, foreground detail, negative
   space. Note the mood (light, haze, grain, palette).
2. **Decide placement in words first.** "The ruined colonnade is the hero — dead
   centre, mid-depth, catching the key light. Two tall building masses frame left
   and right, stepping down toward the back into haze. A loose row of cones leads
   the eye in from the left foreground. The centre-front stays open." Only then
   write coordinates.
3. **Write explicit, named data.** A hand-authored array with a commented entry
   per object — position/rotation/scale picked on purpose. NOT a generator.
4. **Screenshot (headed) and LOOK.** Run the headed capture (below). Actually
   open the image and judge it against the reference. Do not proceed on a
   typecheck — a scene that compiles can look wrong.
5. **Adjust and re-shoot** until that element reads right, then move to the next.
   100% visual confirmation of every step — no "probably fine".

## Authored data, not generators

```tsx
// GOOD — deliberate, readable, each piece justified.
const BUILDINGS: Building[] = [
  // Left framing mass — tallest, closest, anchors the left edge.
  { pos: [-9, 0, -3], size: [4, 8, 3.5], tone: 'dark' },
  // Steps down and back toward the haze behind it.
  { pos: [-11, 0, -8], size: [3, 5, 3], tone: 'mid' },
  // …
]

// BANNED — this is exactly what AGENTS.md #3 forbids.
for (let i = 0; i < 7; i++) {
  const x = baseX + side * range(-2.5, 2.5)   // ❌ random scatter
  building(x, range(-12, -2), range(2, 4), range(2.5, 8))
}
```

Variation is still good — buildings differ in height, cones in scale — but it is
**chosen** variation, not `Math.random()`. If you want a stepped skyline, write
the steps.

## Composition checklist (judge every screenshot against this)

- **One clear focal point**, and the frame leads to it. Here: the colonnade.
- **Framing** — masses at the edges push the eye inward; the frame doesn't leak.
- **Depth in layers** — distinct foreground / midground / background, separated by
  overlap, scale falloff and haze — not one flat wall of blocks.
- **Deliberate negative space** — the open foreground is a choice, kept clear.
- **Rhythm, not noise** — clusters and gaps read as intentional grouping.
- **Silhouette reads** — every key shape is legible against what's behind it.
- **Nothing blocks the camera** or the focal point by accident.

## Headed visual confirmation (required, not optional)

Verification is a **headed** browser (AGENTS.md #1: headless is banned, headed is
fine). Run the dev server, then capture with Playwright `headless: false`:

```bash
npm run dev            # note the port (5173, or 5174 if taken)
node scripts/shot.mjs http://localhost:5174/ docs/shots/step.png
```

`scripts/shot.mjs` launches a VISIBLE Chromium window, waits for warmup, hides the
r3f-perf panel (`p`), and screenshots the canvas. Then **Read the PNG and look at
it** — that is the verification, not the fact that it saved.

## Still keep draw calls sane

Hand-authored ≠ one `<mesh>` per object. Author the DATA by hand, then render
repeats through instancing (see `threejs-instancing-materials`): map your explicit
`BUILDINGS` array into `<Instances>/<Instance>`. Deliberate layout and a low
draw-call count are not in tension — the array is authored, the rendering is
batched.
```
