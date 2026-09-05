---
name: rig-socket-fitting
description: Attach a worn or held prop (backpack, holster, sword, pouch, sidearm, helmet) to one bone of an existing humanoid rig — deriving the mount point from the source mesh instead of guessing it, baking correct orientation into the asset rather than compensating in code, and building a live tuning bench that starts from the current truth instead of zero. Use whenever mounting a new piece of gear onto a rig's bone, when a mounted prop renders on the wrong side/backwards/floating/clipping, when preparing a rigid prop for a later secondary-motion (jiggle/sway) pass, or when the fit needs a designer-tunable bench like an existing weapon/prop lab. Trigger phrases: "attach this to the rig", "mount on the [bone] bone", "the [prop] is backwards/sideways/floating", "add a fitting lab for this", "bake the rotation instead of a code constant", "prepare for jiggle bones later".
---

# Rig socket fitting

Mounting a prop on a rig bone is two separable problems that get solved out of
order more often than not: **where the prop's own origin should be** (a fact
about the source mesh) and **how that origin behaves once parented to a bone**
(a fact about the rig). Solve the first in the authoring tool. Solve the second
by measurement at runtime. Never let a code-side rotation constant paper over
a mistake that belongs in either of those two places.

## 1. Derive the mount point — don't guess it

A prop's mount point (where it touches the body) is a geometric fact about the
mesh, not a number to eyeball. Measure it:

- Sample the mesh in the region the prop actually contacts (a height/depth band
  near where the socket bone sits), and take the real surface there — the
  vertex extremum in the contact direction, or a ray-cast from outside the mesh
  toward the body if vertex density near the true contact line is sparse (common
  where two surfaces meet in a seam or channel — sampling only exact-centerline
  vertices there can come back empty even though the surface clearly exists).
- Re-origin the asset (translate mesh data and any accompanying bones, not just
  the object transform) so that measured point becomes local `(0,0,0)`. A model
  authored around its own attach point needs no position solve at runtime — the
  entity parents it with zero offset, the same way a well-designed grip/socket
  system solves position from a measured anchor instead of a hand-typed vector.

## 2. If the prop needs future secondary motion, split it now — even with no natural seam

A single fused/scanned mesh (no separate strap, flap, or panel objects) can
still be prepared for a later jiggle/sway/cloth pass without re-modeling it:

- Add a second bone (a hinge) below the rigid mount, positioned at the pivot
  height the future motion should rotate around.
- Weight the mesh to the two bones **procedurally**, by a continuous property
  of the geometry (height, distance from the mount, etc.) with a smoothed blend
  band at the boundary — not hand-painted. This is deterministic, reproducible
  from the same source, and auditable (print the weight histogram: it should
  show a clear rigid region, a clear hinge region, and a blended band between).
- Leave the hinge bone unposed/undriven for now. The point of this step is that
  the asset is *ready* — nothing about wiring the rigid mount today should have
  to change when the motion pass actually lands.

## 3. Before copying an existing socket pattern, confirm it's the CURRENT one

A codebase that has shipped more than one character/prop pipeline over time
often has an older approach still sitting in the tree (baked/merged into a
specific character's own mesh, a one-off hand-placed matrix) alongside the
current one (a live GLB portaled onto a named bone, refit automatically). Grep
for prior art before designing the new prop's attachment — but check which
pattern the ACTIVE rig/entity actually uses today, not just which pattern
exists. Copying the retired one reproduces its constraints (its own coordinate
convention, its own hand-tuned numbers for a different skeleton) for no reason.

## 4. Auto-fit scale and position from measurement, never a hand-typed constant

At runtime, once the prop's group is a child of the socket bone:

- Scale: measure the prop's own authored size (bounding box along its up axis)
  and divide a real-world size target by that size times the bone's *live
  accumulated world scale* (`bone.getWorldScale()`), not a guessed factor. A rig
  is rarely authored at unit scale, so skipping the bone's own scale produces a
  prop that's correctly proportioned in isolation and wrong on the character.
- Position: if step 1 was done, this is zero. If a small nudge is still needed
  (padding/thickness tolerance), that is the ONE hand-tuned constant this
  system carries — keep it isolated and commented as measured-once, not folded
  into a pile of magic numbers.

## 5. A bone's bind-pose orientation is not aligned to world or character axes — verify, don't assume

Deep in a limb or spine chain, a bone's local axes are whatever the rig's
authoring pipeline produced — there is no guarantee its local "forward" matches
the character's forward, or that identity rotation looks upright. Don't reason
this out analytically as a first move: mount the prop, look at it from a real
camera, and read what's actually wrong (sideways → likely a bone-local-axis
mismatch; correctly placed but front-to-back reversed → the asset's own
authored front/back convention doesn't match the socket's expectation).

## 6. Fix orientation in the SOURCE, not with a compensating code constant

When the prop mounts backwards or rotated, the fix belongs wherever the wrong
fact lives:

- If the asset's own front/back or up convention is backwards, **rotate the
  source mesh in the authoring tool and re-export.** A rotation baked
  backwards into a data file is a data bug; masking it with a `rotationEuler`
  in code moves the confusion to whoever reads the code next and has no way to
  tell "this cancels an asset mistake" from "this is the real mount geometry."
- Reserve a code-side rotation/position constant for values that are
  genuinely properties of the SOCKET (a per-bone nudge tuned once against the
  live rig, analogous to a hand-tuned grip nudge) — not for undoing an asset
  authored wrong.
- After overwriting a source asset at the same import path, remember that a
  bundler/dev-server commonly caches optimized asset bytes by import URL in
  memory, not by file content. If a re-export "doesn't show up," the fix may
  be stale-cache, not a wrong fix — restart the dev process and clear its
  asset cache before concluding the re-export failed.

## 7. Ship a live tuning bench — and make it start from the truth

If the project already has a fitting bench for a similar prop (a hand-held
weapon lab, a prior equipment lab), extend or mirror it rather than building a
one-off. A good bench:

- Exposes position/rotation/size as sliders, with a readout formatted as
  ready-to-paste code (props on the entity's call, or a constant definition).
- **Initializes every slider from the CURRENTLY BAKED values, not from
  zero.** If the entity already has a tuned default (from a previous session
  in this same bench), a bench that opens at `[0,0,0]` silently overrides that
  tuned fit back to an untuned one the instant it mounts — the person testing
  a small further nudge is actually looking at a regression they didn't ask
  for. Read the entity's own exported defaults into the bench's initial state
  instead of duplicating the numbers.
- Prints ABSOLUTE values in its readout, not deltas — the value shown must be
  exactly what gets pasted back as the new default, with no mental addition
  step.

## 8. Verify on the rig in motion, not a static pose

A socket bone rarely sits still — it may carry a spine twist, an arm-swing
mask, a stride cycle. Confirm the mount survives all of it: idle, walking,
running, and whatever aim/action state drives the same bone chain, from more
than one camera angle (a profile/side view is usually what exposes a
front-back or depth error that a top-down or front view hides).

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
