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

## Edge treatment

Chamfer every edge that is not deliberately sharp: a perfectly sharp arris is one
pixel wide at every distance, so it aliases when the camera moves and disappears
when it stops. The sizes, the exceptions, and the reason they are optical rather
than decorative are in
[`../_conventions/edge-treatment.md`](../_conventions/edge-treatment.md) — one
copy, because a rule kept in seventeen places is a rule that is right in some of
them. Treat its figures as a default for metre-scale work and set your own if
your project's scale or look differs.
