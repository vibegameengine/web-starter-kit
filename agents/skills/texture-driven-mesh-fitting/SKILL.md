---
name: texture-driven-mesh-fitting
description: Reshape source-locked mesh boundaries so the geometry fits texture-atlas or decal contours 1:1 before final UV/material work. Use when textures look off because the model behind them does not match the source texture region, or when the mesh must adapt to the texture instead of stretching the texture onto an approximate mesh.
when_to_use: Texture-driven geometry fitting, mesh boundary fitting to atlas masks, UV-preserving contour correspondence, point/landmark deformation, source mask to mesh repair.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_object_info
---

# Texture-Driven Mesh Fitting

This skill fixes the common failure: a texture is mapped correctly, but the mesh silhouette underneath is wrong.
The mesh adapts to the source contour; the texture is not stretched to hide a wrong mesh.

## Preconditions

- Structural parts are segmented (`source-part-segmentation`).
- Each part has a contour/mask and, if textured, an atlas region (`atlas-uv-fitting`).
- The object is source-locked in front X/Z before depth is added.
- Canonical view policy is resolved (`multiview-constraint-solver`) if views conflict.

## Workflow

1. Extract source contour from the texture/wireframe region.
2. Extract current mesh boundary in the same projected coordinate space.
3. Build ordered contour correspondence by arc length, named landmarks, or seam/control points.
4. Move boundary vertices to source contour positions.
5. Move interior vertices by smooth interpolation, piecewise-affine warp, or thin-plate-spline style deformation.
6. Preserve UV parameterization by remapping boundary-fitted local coordinates into the atlas rectangle.
7. Re-render overlay; do not proceed to look-dev until texture-region silhouette passes.

## Acceptance gates

- Per-part source/product bbox center and size within tolerance.
- Boundary maximum sample error below tolerance after normalization.
- Texture atlas region does not visibly bleed outside the fitted mesh in front view.
- Named landmarks (`leaf_tip`, `base_left`, `base_right`, `face_corner`, etc.) pass `landmark-fit-repair`.

## Hard rules

- If a texture crop has a different silhouette than the mesh, reshape the mesh first.
- Do not use global UV stretching to hide geometry mismatch.
- Boundary fitting must happen before side-depth/crown deformation.
- Do not tune material/light to compensate for geometry/UV misfit.

## Scripts

- `scripts/contour_correspondence_report.py` reports bbox, centroid, and sampled contour deltas between a source mask and a render/object mask.

## Sources distilled

- Piecewise-affine/landmark warping gives a practical mesh deformation model.
- Thin-plate-spline style deformation is appropriate for smooth mascot/logo surfaces when landmarks are sparse.
- Blender mesh vertices/UV layers can be edited directly; BMesh is useful for cleanup after deformation.

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
