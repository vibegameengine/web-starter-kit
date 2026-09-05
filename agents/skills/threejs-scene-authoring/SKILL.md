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

## The chamfer rule — no naked arris

**Every edge where two faces meet gets a chamfer of 0.5–1 cm, in world scale.**
The only exceptions are the edges that must stay sharp to do their job:

- a MATING face's arris, where the piece butts flat against its neighbour and a
  chamfer would open a visible seam;
- an edge the design is explicitly about — a blade, a crack, a broken end, a
  cut that is meant to read as violence;
- an edge that is never within reach of a highlight, because it is buried in
  another mass.

Everything else is chamfered, and the reason is optical, not decorative. A
perfectly sharp arris returns no highlight: it is one pixel wide at every
distance, so it renders as an aliased line that flickers when the camera moves
and vanishes when it stops. A 0.5–1 cm cut gives the edge a face of its own,
that face catches the light at a different angle from both of its neighbours,
and the object suddenly has a drawn outline that holds at any distance. This is
the cheapest form in the whole pipeline: two triangles per edge, and it does
more for how manufactured an object looks than any texture on it.

The size matters both ways. Under 0.5 cm it is invisible at gameplay distance
and you have paid triangles for nothing; over about 1 cm it starts reading as a
bevel — a deliberate moulding — and the piece looks soft, moulded rather than
cut. Real stone, timber and metal all arrive at the same range, because it is
what a tool leaves behind.

When a piece is generated rather than modelled, the rule becomes explicit:
chamfer every arris whose dihedral angle exceeds about 18°, and exclude any edge
lying wholly in a mating plane. When it is modelled by hand, it is the last pass
before export, and it is checked at a grazing angle under a hard light, where a
naked arris shows as a hard white thread and a chamfered one as a soft band.

## No flush faces — two surfaces never share a plane

**When two objects meet, their faces must never be coplanar.** If a panel sits on
a wall, a decal on a floor, a sign on a door, a step on a landing, a trim strip
on a beam — the added face stands PROUD of the surface it lies on, by a real,
deliberate distance. Never zero.

The failure is Z-fighting, and it is not a rare artefact — it is guaranteed. The
depth buffer stores a value with finite precision, and that precision is worst
where most geometry lives: far from the near plane. Two faces at exactly the
same depth round to the same value, and which one wins is decided per pixel, per
frame, by floating-point noise. The result is the shimmering stripe of garbage
that crawls across the surface as the camera moves, changes with the resolution,
and disappears in the exact screenshot you take to prove it is fixed.

**The offset that works:**

- **0.5–2 cm for anything at arm's length or nearer** — a plaque on a wall, a
  panel in a door, a rune on a slab. This is also the honest reading: a plaque
  is a piece of matter, and it has a thickness.
- **2–5 cm for large architectural overlays** — a pilaster on a wall face, a
  string course, a boarding over a window. Their own depth already exceeds this,
  so the rule costs nothing.
- **Never below 0.5 cm at world scale.** Under it you are relying on depth
  precision holding at whatever distance the camera happens to be, and at 200 m
  it does not.
- **Never a "magic epsilon" like 0.001.** It survives the lab, where the camera
  is 3 m away, and fails in the level, where it is 80 m away. If a number is too
  small to be a real thickness, it is too small to be a fix.

Two related cases, same rule:

- **Coincident SOLIDS.** Two boxes whose faces exactly touch also fight, on the
  shared face. Either overlap them properly, so one is unambiguously inside the
  other, or separate them. Exactly touching is the one option that is wrong.
- **Sitting on the ground.** A prop whose base is exactly at y = 0 on a ground
  plane at y = 0 fights across its whole footprint. Sink it, or lift it.

The cheap test: put the camera far away and at a grazing angle, then move it.
Z-fighting appears at distance and it appears in MOTION; a still frame taken
from 3 m is the one view where a coplanar pair looks perfect.
