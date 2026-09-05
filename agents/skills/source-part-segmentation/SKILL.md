---
name: source-part-segmentation
description: Segment overlapping visual parts from source images, wireframes, texture atlases, and decals before mesh reconstruction. Use when a mascot/logo/template contains touching or overlapping components and exact structural part masks are needed before contour-to-mesh, UV fitting, or landmark repair.
when_to_use: Overlapping part extraction, component masks, marker/watershed segmentation, contour hierarchy analysis, atlas part isolation, manual seed fallback for source-locked Blender reconstruction.
allowed-tools: Read Bash Glob Grep
---

# Source Part Segmentation

Use this before `contour-to-mesh` when a source image contains overlapping or touching designed parts.
The output is not “nice masks”; it is a **source-of-truth part inventory** that downstream geometry must obey.

## Inputs

- source image, wireframe, decal, or texture atlas;
- optional manual seed manifest with named parts, polygons, seed points, rough rectangles, or HSV/color ranges;
- source manifest with structural/decorative/context classification and expected part count.

## Workflow

1. Choose the cleanest modality: alpha, edge, dark-line, bright-on-dark, color-band, or atlas region.
2. Extract contours and hierarchy to identify candidate objects, holes, nested details, and strokes.
3. If components touch, run distance-transform marker watershed first.
4. If watershed over/under-splits, switch to **seeded segmentation**:
   - create named part seeds (`bbox`, `polygon`, or `seed_point` + optional flood/HSV tolerance);
   - save one mask per named structural part;
   - mark ambiguous overlaps explicitly instead of merging them.
5. Classify masks as `structural`, `decorative`, `face_feature`, `aura_context`, or `validation_only`.
6. Pass structural masks to `contour-to-mesh`; pass feature masks/landmarks to `landmark-fit-repair`; pass atlas regions to `atlas-uv-fitting`.

## Hard rules

- Do not infer repeated parts from symmetry; segment what the source shows.
- Do not merge overlapping components if the manifest expects separate structural meshes.
- Do not proceed to final modeling when part count differs between source images; write a conflict report or canonical policy.
- If automatic segmentation is ambiguous, write an ambiguity report and require or create manual seed rectangles/points.
- Keep stroke/line masks separate from filled-part masks; wireframe strokes are guides unless explicitly used as the contour boundary.

## Seed manifest schema

```json
{
  "schema": "source_part_seed_manifest.v1",
  "image": "path/to/source.png",
  "parts": [
    {"name":"leaf_top", "class":"structural", "bbox":[x,y,w,h], "mode":"non_background"},
    {"name":"face_shell", "class":"structural", "polygon":[[x,y],[x,y],...], "mode":"polygon"}
  ]
}
```

Allowed `mode` values: `polygon`, `bbox`, `non_background`, `dark_lines`, `bright_on_dark`, `hsv_range`.

## Scripts

- `scripts/segment_source_parts.py` produces component masks and a JSON report from an image, with optional watershed.
- `scripts/seeded_part_masks.py` converts a named seed manifest into deterministic named masks and a part inventory.

## Sources distilled

- OpenCV contours/hierarchy/moments are the base measurement layer.
- OpenCV distance transform + marker watershed is the first automated split method for touching components.
- Active contour refinement can improve a rough mask boundary after segmentation.

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
