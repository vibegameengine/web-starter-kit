---
name: fit-repair-optimizer
description: Turn multiview fit reports into a sequential or parallel repair queue for aligning Blender products to source-of-truth templates. Use after validation shows disalignment, when the agent must iteratively fix wireframe, texture, lighting, or projection mismatches, and when skill gaps should trigger self-refinement before another rebuild.
when_to_use: Iterative source-of-truth alignment repair, choosing sequential vs parallel correction order, generating fit repair queues, stopping on contradictory templates, or coordinating geometry/UV/lighting fixes from validation reports.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Fit Repair Optimizer

This skill converts validation failures into an executable repair queue. The source templates are the contract; the current model is disposable.

## Decision: sequential or parallel?

Use **sequential repair** when failures are coupled:

1. Canonical view / source conflict unresolved.
2. Front silhouette or part count fails.
3. Geometry dimensions fail before UVs can be trusted.
4. Texture region boundaries depend on geometry changes.
5. Lighting/look depends on final material placement.

Use **parallel repair** only for independent tracks with disjoint write scopes:

- geometry recipe/placement tuning;
- atlas-region classification;
- material/look calibration;
- validation tooling improvements.

Do not parallelize two tasks that both edit the same Blender recipe, object transforms, or UV assignment file.

## Mandatory repair order

```
0 source-conflict / multiview-rigidity gate
1 structural part count
2 front silhouette and landmarks
3 side/back/top depth and projection
4 UV/texture region fit
5 material/light/look calibration
6 export and final validation
```

If an earlier stage fails, later stages may be analyzed but must not be finalized.

## Source-conflict gate

Before repair, use `multiview-constraint-solver` to check whether templates are mutually satisfiable. If the same physical axis receives incompatible ratios across views, write a conflict report and require a canonical policy:

- front+side canonical;
- front+top canonical;
- corrected template sheet;
- view-specific cheat renders only, not a rigid 3D model.

## Repair queue schema

Each repair item must include:

- `id`
- `stage`
- `view_scope`
- `failure`
- `measured_delta`
- `proposed_action`
- `write_scope`
- `parallel_group`
- `blocked_by`
- `acceptance_gate`

## Skill-gap rule

If the same failure recurs twice, stop and invoke `quality-refinement-autoloop` before another rebuild. The autoloop must capture evidence, diagnose the missing method, sanitize the lesson into generic publishable guidance, patch the relevant skill(s), validate the skill stack, then return here with a new repair queue. Common routing:

- geometry mismatch → `contour-to-mesh`, `orthographic-registration`, or this skill;
- UV/texture mismatch → `atlas-uv-fitting`;
- lighting mismatch → add/look-calibrate guidance to `blender-lighting` or a look-calibration skill;
- validation mismatch → `multiview-fit-loop` / `reference-analysis-validator`.

## Output

Write a project repair plan such as `ALIGNMENT_REPAIR_QUEUE.json` and a human-readable `ALIGNMENT_REPAIR_METHOD.md`.

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
