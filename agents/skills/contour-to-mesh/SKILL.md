---
name: contour-to-mesh
description: Build Blender mesh surfaces directly from extracted 2D contours/masks instead of approximate primitives. Use for 1:1 mascot/logo reconstruction, exact leaf/petal silhouettes, filled wireframe shapes, shallow bas-relief forms, or when the model outline must match a front template before adding depth.
when_to_use: Source-locked contour-derived meshes, silhouette-first modeling, triangulated mask/contour surfaces, mesh generation from OpenCV contours, or replacing generic ellipses/primitives with measured shapes.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Contour to Mesh

Use this when a reference silhouette is the contract. The mesh starts as a filled 2D contour in front-view X/Z, then gets shallow Y depth/crown after validation.

## Workflow

1. Extract or select a clean contour/mask for one structural part.
2. Generate a triangulated mesh recipe with `scripts/mask_to_mesh_recipe.py`.
3. Run the generated Blender Python to create a named `GEO_*` mesh.
4. Assign front-projected UVs immediately.
5. Add depth only as a modifier or vertex displacement that preserves X/Z boundary positions.
6. Validate the front render against the source mask.

## Hard rules

- Do not use radial duplication unless the manifest says the source is symmetric.
- Do not use a generic ellipse if a contour exists.
- Boundary vertices must keep source X/Z coordinates.
- Depth deformation may move Y and inner vertices, but must not alter front silhouette.
- One structural source part should become one named structural mesh.

## Blender pattern

Generated mesh coordinates should map image `x` to Blender `X` and image `y` to Blender `Z` with vertical flip. Use `Y` only for thickness/depth.


## Front-plane rotation rule

In this Blender coordinate convention, the front camera looks along the Y axis and the reference silhouette lives in the X/Z plane. Therefore 2D rotations inside the front view are rotations around the **Y axis**, not around Z. Use `rotation_euler = (0, angle, 0)` for 2D component orientation in the front projection. Z rotation spins objects into/out of screen-space incorrectly for X/Z-plane meshes.

## Sources distilled

- Blender Mesh API: create meshes from vertices/faces using `from_pydata`.
- Blender BMesh: use for cleanup, triangulation, normals, smoothing.
- OpenCV contours: detect and simplify boundaries.
- Delaunay triangulation: useful for filled interior meshes when filtered by mask containment.


## Part-inventory handoff

When masks come from `source-part-segmentation`, preserve the `part_inventory.json` names in Blender:
`GEO_<part_name>`, `MAT_<part_name>`, and UV layer names. Mesh generation must record:

- source image size;
- source mask path;
- contour boundary point count;
- boundary landmark points (tip, base-left, base-right, centroid/extrema) when detectable;
- atlas UV rectangle or projection mode.

For exact mascot/logo work, generate boundary vertices from the contour and add interior vertices only for surface support.
The boundary is a contract: bevels, solidify, subdivision, shrinkwrap, or sculpt passes must not move front-view X/Z boundary vertices unless a new source mask is produced.

## Hole and stroke policy

- Filled structural masks become meshes.
- Wireframe strokes guide boundaries/landmarks; they are not structural meshes unless the manifest classifies them as decorative linework.
- Holes/negative regions should be kept as separate cut masks when they affect silhouette; otherwise implement them as decals/material masks.


## Source-locked front-skin fallback

When a design sheet is painterly/stylized and separate orthographic views are not CAD-consistent, use a **front-skin** pass before sculptural interpretation:

1. choose the canonical front/master source;
2. extract the visible subject mask as a filled contour;
3. create a shallow 2.5D mesh whose X/Z boundary is that contour;
4. assign full-image front-projected UVs so the rendered front matches the source pixels;
5. add depth only along Y and behind the front surface;
6. optionally add separate relief/backing parts for side plausibility, but keep the front skin as the visual acceptance gate.

This is a generic fallback for logos/mascots where a faithful front read is more important than speculative volume. Mark it as `front_locked_visual_skin`, not as a fully solved turntable model.

## Script

- `scripts/source_locked_skin_recipe.py` extracts a largest/canonical foreground component and emits a mask + contour mesh recipe using full-image front-projected UV coordinates.

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
