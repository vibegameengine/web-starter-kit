---
name: mascot-logo-reconstruction
description: Orchestrate a fail-gated, source-locked Blender reconstruction of mascots, logos, brand avatars, and stylized flat characters from wireframes, texture packs, and orthographic views. Use when the user requires a 1:1 brand/model match rather than a plausible stylized interpretation.
when_to_use: Brand mascot/logo 3D reconstruction, exact part counts, texture-driven model matching, repeated “does not match reference” feedback, or full pipeline coordination across analysis, contour mesh, registration, UV fitting, validation, animation, and export.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Mascot / Logo Reconstruction

This is the top-level skill for 1:1 brand mascot reconstruction. It chains the specialized skills and enforces stop/go gates.

## Harmonization requirement

For mascot/logo work, use `blender-skill-harmonizer` first when multiple source types or validation failures are present. It sets canonical source policy and prevents conflicts between reconstruction, UV, fit-repair, lighting, export, and animation skills.

## Skill chain

1. `reference-analysis-validator` — source inventory, manifest, part counts, masks.
2. `orthographic-registration` — shared front/side/back/top coordinate contract.
3. `contour-to-mesh` — structural meshes from measured silhouettes.
4. `atlas-uv-fitting` — per-part texture/UV fitting.
5. `blender-materials` / `blender-lighting` — only after geometry and UVs pass.
6. `reference-analysis-validator` again — overlay gates before export.
7. `blender-export` — export only after gates pass.
8. `blender-animation` — only after static model is accepted.

## Non-negotiable order

Static reference fidelity comes before animation and beauty rendering.

```
measure → manifest → contour meshes → depth registration → UV fit → overlay validation → export → animation
```

## Hard gates

- expected structural part count equals Blender scene/export structural part count.
- front silhouette overlay passes threshold.
- face/features landmarks pass tolerance.
- side/back/top renders match their registered envelopes.
- texture atlas regions are mapped per part.
- optional aura/background is separated from base structural GLB.

## Modeling guidance

- Treat mascots/logos as designed symbols, not natural objects. Symmetry is not guaranteed.
- Do not infer hidden leaves/petals from radial math.
- Avoid primitive-first construction when a silhouette exists.
- Use semantic object names and validation prints.

## Source-manifest structural part invariant

Create exactly the structural parts declared by the source manifest. Extra background arcs, glow, aura, shadows, guide marks, and decorative rings are context/decor unless the manifest explicitly promotes them to structural geometry.


## Front-plane rotation rule

In this Blender coordinate convention, the front camera looks along the Y axis and the reference silhouette lives in the X/Z plane. Therefore 2D rotations inside the front view are rotations around the **Y axis**, not around Z. Use `rotation_euler = (0, angle, 0)` for 2D component orientation in the front projection. Z rotation spins objects into/out of screen-space incorrectly for X/Z-plane meshes.

## Output contract

Every final reconstruction folder should include:

- `reference_manifest.json`
- `registration_report.json`
- `atlas_regions.json`
- `validation/front_mask_validation.json`
- `validation/front_overlay_reference.png`
- named `.blend`
- base `.glb`
- optional aura/context `.glb`
- `BUILD_NOTES.md` with pass/fail gates

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
