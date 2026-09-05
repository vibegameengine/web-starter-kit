---
name: threejs-procedural-architecture
description: Build modular Three.js architectural assets from an inspectable massing and facade plan. Use for a reusable building, ruin, wall, facade, roof, arch, trim, or kit; never use it to generate a scene layout, world placement, or runtime decoration.
---

# Three.js Procedural Architecture

Generate an asset from a semantic construction plan. Keep level composition separate: this skill produces a local-coordinate prefab; an authored scene chooses whether and where that prefab appears.

## Asset pipeline

```text
dimensions and module settings
  -> mass plan
  -> exposed-surface analysis
  -> facade and roof plan
  -> module registry
  -> material-slot mesh compilation
  -> local-coordinate asset
```

## Workflow

1. Define the asset's real or perceptual dimensions, silhouette, and local origin.
2. Separate massing, facade rhythm, openings, roof, and ornament into named layers.
3. Resolve exposed faces before assigning facade modules; never spend detail on hidden internal faces.
4. Give every module semantic anchors and construction depth in the asset's local frame.
5. Compile compatible repeats by material slot without erasing intentional material boundaries.
6. Preserve UV density, hard edges, apertures, and construction seams through the mesh build.
7. Export or mount the result as a unit-scale local prefab; choose its world transform only in the authored scene.

## Rules

- Use deterministic parameters for asset variants; variation may select valid modules, never repair invalid geometry.
- Do not generate building positions, rotations, routes, districts, city blocks, or scene dressing.
- Do not use random placement, scatter, or loops that invent world composition.
- Keep roots at unit scale; put dimensions in mesh geometry and module contracts.
- Record module count, triangle count, material slots, bounds, and shadow behavior.

## Acceptance

Inspect silhouette-only, flat material, grazing light, close corners, roof transitions, openings, UV density, and the asset from every relevant side. Verify that variants retain the same architectural identity and contain no overlaps, floating detail, or unowned surfaces.

## Routing boundary

Use scene-authoring guidance for all level placement and composition. Use procedural-geometry guidance when the task is only a reusable profile, sweep, or mesh writer rather than an architectural kit.

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
