---
name: blender-mcp-hand-modeling
description: Model, light, and material an asset by hand directly through a connected Blender MCP tool (execute_blender_code / get_viewport_screenshot), with every pass gated by a deterministic pixel-arithmetic pass/fail check before it is accepted — not just eyeballed. Use whenever an agent drives Blender live via MCP instead of writing a plan or generating code; foundational for any MCP-hand-modeling task, reference-locked or not.
when_to_use: An agent has a live Blender MCP connection and is building/editing geometry, lighting, or materials by executing Blender Python through it, and the result must be provably close to a reference before the next pass starts. Also use to decide whether a capture is gate-grade evidence or just a quick look.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_viewport_screenshot mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Blender MCP Hand Modeling

Live, tool-driven Blender modeling through MCP is not lower-stakes than generated code —
it is *harder* to audit, because nothing about it is diffable. A generated Three.js factory
can be read; a sequence of `execute_blender_code` calls against a live scene can silently
drift from the reference with no artifact anyone reviews. This skill closes that gap: every
pass that changes the scene must produce comparable pixel evidence and pass a deterministic,
zero-token check before the agent is allowed to call it done and move to the next pass.

This is the MCP-hand-modeling analogue of `img2threejs`'s Tier-1 gate — same doctrine
(deterministic-first, model-last), different medium (a live `.blend` scene instead of
generated code).

## Foundational role

This skill is not one more optional add-on skill — it is the acceptance mechanism that every
other Blender skill's "render again and check it reads" checkpoint routes through whenever the
work is happening live via MCP:

- Under `blender-pro-workflow`'s 11-step order, every "render again, should read before
  proceeding" checkpoint (composition test, lighting v1/v2, final) is this skill's `single`
  gate, not a free-form look.
- Under `blender-skill-harmonizer`'s reference-locked chain, every sequential gate
  (front geometry, multiview geometry, UV/material fit, lighting/look) that is being produced
  by live MCP execution is gated the same way; harmonizer's artifact contract records the
  result alongside its own JSON reports.
- `visual-verification-gate`'s "never claim visual success without inspecting a captured
  frame" rule is satisfied by running this skill's script over the capture, not merely by an
  agent looking at a screenshot and asserting it looks right.

A pass may be marked `continue` only when its gate-grade capture passed. A capture that only
went through `get_viewport_screenshot` for a quick look is not evidence for that decision.

## Capture protocol — gate-grade vs. eyeball-only

`get_viewport_screenshot` is fine for a quick sanity look, but its background color, lighting,
and shading mode are whatever the viewport currently happens to be — not controlled, not
comparable frame to frame. It is **not** gate-grade evidence.

For a gate-grade capture, drive a fast, cheap, transparent-background render through
`execute_blender_code` instead:

```python
import bpy

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.film_transparent = True
scene.eevee.taa_render_samples = 16
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = '<gate-evidence-path>.png'
bpy.ops.render.render(write_still=True)
```

Match the camera to the reference's framing (or to the previous pass's camera, for a
same-object-different-pass comparison) before rendering. Keep the render cheap — this is a
gate check, not the hero render; low samples and low resolution are correct here.

## Deterministic gate script

`scripts/viewport_gate_check.py` — pure Python 3.10+ stdlib, no PIL/numpy, no network, no
model call. Input contract: both PNGs must be RGBA / 8-bit / non-interlaced / transparent
background (exactly what the render snippet above produces).

```
python scripts/viewport_gate_check.py single \
  --reference <reference-or-previous-pass-render>.png \
  --render <this-pass-render>.png \
  [--expect-symmetric] [--json]

python scripts/viewport_gate_check.py multi-angle \
  --reference <reference-angle-render>.png \
  --orbit <angle-1>.png --orbit <angle-2>.png ... \
  [--collapse-ratio 0.15] [--json]
```

`single` checks silhouette IoU (≥0.85), aspect-ratio delta (≤0.05), and scale delta (≤0.08)
against the previous accepted state or the source reference. Bilateral symmetry is reported
always but only gates when `--expect-symmetric` is passed — most props and scenes are not
symmetric, so don't fail a pass on a metric that doesn't apply to it.

`multi-angle` catches the same failure `img2threejs` calls "degenerate-view": a flat plane or
badly-proportioned volume that reads fine from the modeling camera but collapses in silhouette
area when orbited, the way a billboard nearly vanishes seen edge-on. Run it whenever a pass
claims a non-planar form — a single flattering angle is not proof of volume.

Exit code 0 = pass, 1 = a real gate failure, 2 = a script/input error (bad PNG, wrong color
type) — treat 2 as "fix the capture," not as "the geometry is wrong."

## What this does not replace

- It does not judge material/lighting *quality* — only geometric agreement (silhouette,
  proportion, volume-from-multiple-angles). Style, color, and finish still need
  `blender-materials`/`blender-lighting` review and, when it matters, an AI-vision pass on top
  (analogous to Tier 2 in `img2threejs`) — this is Tier 1 only, deliberately cheap and
  discriminative rather than exhaustive.
- It does not replace the headed-window rule: a gate pass from a rendered PNG is not the same
  as a human or agent actually looking at the frame. Run both.

## Self-correction

After a failed gate, decide exactly one of:

- `refine-geometry` — the failing metric is silhouette/proportion; go back into
  `execute_blender_code` and fix the mesh, not the camera.
- `refine-capture` — the *render setup* is wrong (wrong camera, wrong resolution/crop, film
  not transparent) rather than the geometry; fix the capture and re-run the same gate.
- `request-input` — the reference itself is ambiguous or the target genuinely cannot be
  determined from it; stop guessing and ask.
- `stop` — repeated failures on the same metric indicate a wrong approach, not a tuning
  problem (e.g. `refine-geometry` was tried 3+ times with no IoU improvement); escalate rather
  than keep spending passes.

Never mark `continue` by re-running the gate with looser thresholds to make it pass — the
thresholds are the contract; if a pass genuinely can't meet them, that is a `request-input` or
`stop`, not a threshold edit.

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
