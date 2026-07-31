---
name: physics-manikin-fitting
description: >-
  Fit a physics manikin (a capsule rigid body per body part, joined by limited
  joints) onto a rigged character. The procedure takes nothing from bone names
  and nothing from a vendor — it has been exercised on Mixamo-compatible
  humanoids, and carries an explicit path (role mapping, topology inference) for
  rigs that are neither. MANDATORY before pointing a ragdoll at a new model,
  adding a character to an existing ragdoll, writing or editing a segment/bone
  table, changing a capsule's radius, length or centre, or debugging a collider
  that is missing, oversized, or sitting somewhere the mesh is not. Enforces:
  map ROLES not names, index the rig as bones AND nodes, take shape from the
  MESH (a bone is an axis, not an outline), express fits relative to the rig
  (never in absolute metres), and validate the mapping before believing a single
  body. Trigger on: "ragdoll on a new character", "the collider is on the neck",
  "the head has no collider", "capsule is huge / too wide", "non-Mixamo rig",
  "our own rig", "custom skeleton", "bone names don't match", "fit the collider
  to the mesh", "подогнать манекен под модель", "риг не миксамо", "коллайдер не
  на месте".
---

# Fitting a physics manikin to a rig

A physics manikin is a small set of rigid bodies — one capsule per body part —
tied together by limited joints and driven from (or driving) a skinned skeleton.
Building one means answering three questions that people routinely answer as if
they were one:

1. **Which joints are the body's parts?** — a mapping problem, and every rig
   names things differently.
2. **What SHAPE is each part?** — a measurement problem, and the skeleton cannot
   answer it.
3. **How does each joint behave?** — limits, damping, masses, ramps. Out of
   scope here; this skill stops at the point where the bodies exist and are the
   right size in the right place.

Nearly every "the ragdoll is broken on this character" report is question 1 or 2
answered by assumption. The single most expensive assumption is treating the
skeleton as a description of the body.

## Rule 0 — a bone is an AXIS, not an OUTLINE

A limb is its bone: shoulder to elbow, and a capsule along it is honest. Almost
nothing else is. A head hangs off both ends of its bone. A pelvis is wider than
any bone in it. A boot sticks out in front of the ankle. A backpack is not on a
bone at all.

Whenever the part is not its bone, no factor of that bone can describe the part —
and worse, the arithmetic usually *hides* the failure instead of raising it: a
radius large enough for a tall head exceeds half the bone length, the capsule's
`halfHeight` clamps to its floor, and a sphere silently falls out. It looks
deliberate. It is not.

**Take the size from the mesh (§4) or from an explicit authored fit (§5). Never
from the bone alone unless the part genuinely is its bone.**

## 1. Index the rig TWICE: bones and nodes

A segment asks the skeleton two different questions:

- it **drives** a joint — that one must be a real skeleton bone, because the
  write-back poses it;
- it is **measured** to a tail, and to joint anchors — and those are only ever
  read as positions, so they need not be bones at all.

Answer them from two indexes. Conflating them loses every helper node the
exporter did not skin, which is exactly where the classic bug lives:

> In glTF, only nodes listed in a skin's joint array become bones on load. Leaf
> ends carry no skin weights, so exporters routinely leave them out — the "top of
> head" and "toe end" nodes arrive as plain nodes. A bones-only index misses
> them, the segment's tail lookup fails, and a fallback invents one.

**A missing tail must be loud.** A silent fallback ("no tail? assume 20 cm down")
does not throw, does not warn, and does not look wrong from most angles — it just
builds the part in the wrong place. If the rig genuinely lacks a tail node, say
so in DEV and let the author decide, because the guess will not match the mesh.

## 2. Map ROLES, not names

Author the manikin against a fixed list of **roles** (pelvis, torso, head, upper
arm L/R, forearm L/R, thigh L/R, shin L/R — or whatever the creature has). The
role list is the contract; joint names are a per-rig detail that must be resolved
into it. Resolve in this order, most explicit first:

1. **An explicit per-rig mapping** supplied with the character. Always allowed to
   win. Any rig can be supported this way in minutes, which is why the manikin
   should never *require* a naming convention.
2. **An alias table** over normalized names — lowercase, namespace and
   vendor-prefix stripped, separators removed. This is what makes a whole family
   of rigs (any export of a given vendor's skeleton) work without edits.
3. **Topology inference**, when nothing else matched. Walk the skeleton, not the
   names: the deepest node whose subtree contains every long chain is the pelvis;
   the two longest 2-link chains descending from it are the legs; the chains
   leaving the upper trunk sideways are the arms; a short terminal chain above
   the trunk is the head. Mirrored parts are distinguished by the sign of their
   offset along the rig's lateral axis, never by the letters L and R.

Whatever resolved the map, **validate it before building a single body**:

- every role resolved, or an explicit "this creature has none";
- each role's joint actually has the child the segment measures toward;
- mirrored roles mirror — their offsets from the trunk match in magnitude and
  flip in sign, within a tolerance;
- chains that should be comparable are comparable (two thighs within a few
  percent of each other);
- no role resolved to a helper: twist, roll, IK, pole, attachment and prop joints
  carry no mass and must never become a body.

A half-resolved map is the worst outcome, because the manikin still builds and
still falls over — just with an arm missing and the mass wrong. Fail loudly, name
the roles that did not resolve, and stop.

## 3. Normalise pose, units and axes before measuring

- **Measure in the BIND pose.** Whatever pose the character happens to be in at
  build time otherwise becomes the manikin's idea of the body. Save every joint's
  transform, reset to bind, measure, restore all of them — not just the ones the
  manikin drives, or the rest stay reset for the body's whole life.
- **Never hardcode metres.** A rig authored in centimetres makes every absolute
  radius 100× wrong. Derive one reference length from the rig itself (a limb
  chain, or floor-to-head) and express *everything* as a factor of a measured
  length. This is also what makes one table work for a child and a giant.
- **Derive the axes; do not assume them.** Forward comes from the trunk's own
  basis, up from the root chain. A hinge axis taken against "up" collapses for a
  near-vertical limb and its direction is then decided by which way the limb
  happens to lean — the same anatomical bend then measures positive on one leg
  and negative on the other.
- **Signs are measured, never reasoned out.** Which way a hinge is allowed to
  bend is a property of how the solver completes its basis. Open the limits wide,
  log the signed angle through a real collapse, then set the range.

## 4. Take the shape from the mesh

The measurement that answers "what shape is this part" needs no artist and no
taste, only the skin:

1. Gather the vertices whose **dominant skin weight** is that joint (sum the
   weights of the slots pointing at it; keep the vertex if the sum passes ~0.5).
2. Transform them into **that joint's own frame** — the inverse bind matrix does
   exactly this.
3. Take per-axis **percentiles, not the raw min/max** (2nd–98th is a good
   default). A nose, an antenna, a strap or one stray welded vertex otherwise
   inflates the whole capsule.
4. Derive the capsule from that box. **The axis is always the bone**, never the
   box's longest side — the collider's rotation comes from the bone anyway, and a
   fit that assumes a different axis silently authors a part rotated away from
   the body it stands for. The formula lives in ONE place,
   `references/mesh-measurement.md` §4; do not restate it, call it.
5. **A large angle between the bone and the box's longest side is a SIGNAL, not a
   switch.** Log it. It says the part is not shaped like its bone: either accept a
   fatter capsule, or accept that a capsule is the wrong primitive here.
6. Decide accessories explicitly. Hair, backpacks, coats and weapon props are
   often skinned to a body joint and will enlarge its part. Either exclude those
   mesh parts by name/primitive, or accept them and say so.

The reference file also carries the glTF accessor walk and the pitfalls of
quantized/compressed meshes.

**Report what you measured, in the units of the rig AND as factors.** A fit
nobody can re-derive is a magic number, and the next person will "tune" it.

### Worked example — check yourself against this before trusting your numbers

A humanoid bench rig. The head bone runs 0.196 from the base of the skull to the
crown, direction `(0, 0.941, 0.338)` in the joint's own frame. The trimmed skull
box measures `0.158 × 0.246 × 0.241`, centred at `(0, 0.077, 0.010)`.

```
halfExtent ⟂ to the bone, worst case       → 0.120     (radius)
halfExtent ALONG the bone (support fn)     → 0.156
halfHeight = 0.156 − 0.120                 → 0.036
full length = 2 × (0.036 + 0.120)          → 0.313
centre (joint frame)                       → (0, 0.077, 0.010)
as factors of the 0.196 bone: radius 0.61, halfHeight 0.18, centre (0, 0.39, 0.05)
```

The angle between the bone and the box's longest side is **19.8°** — logged, not
acted on (§4.5). If your numbers for this box come out at a full length near 0.26
you projected onto the box's axis instead of the bone; near 0.49 you used an
extent where a halfExtent belongs.

The same box **untrimmed** (raw min/max: `0.160 × 0.259 × 0.247`) gives radius
0.124, halfHeight 0.040, full length 0.327 — a 4% difference from the trimmed
fit. That is the whole reason §5 makes you record which method produced a shipped
factor: both are defensible, and nobody can tell them apart afterwards.

## 5. Authored factors vs runtime measurement — decide, don't drift

Both are legitimate. Choose on purpose:

| | Authored factors (a table) | Measured at load |
|---|---|---|
| Works for | one character, or a cast that shares proportions | any character, including user-supplied |
| Cost | none at runtime | one pass over the skinned vertices per model, cacheable per asset |
| Fails when | a new character has different proportions — silently, in the safe direction if you are lucky | the mesh is unusual (accessories, non-manifold parts) and the trim is wrong |
| Reviewable | yes: the numbers are in the source, next to their reasoning | only through a probe that prints the fit |

The rule of thumb: **one character → factors; two or more, or models you do not
control → measure at load.** And whichever you pick, factors are always relative
to a measured rig length (§3), never absolute.

If you ship authored factors, record two things beside them: **which character
they were measured on**, and **by which method** — trimmed percentiles or raw
min/max (§4.3). Both change the numbers, and a factor whose provenance is unknown
cannot be re-derived, only re-tuned.

**Gate, not advice:** the moment a second body mounts the same manikin, re-measure
that body and diff the fits before believing them. Either the factors survive the
diff — say so, with the numbers — or that body gets its own fit, or the fit moves
to load time. "It probably transfers" is how a character ships with a collider
sized for someone else.

## 6. Mass is anthropometric, and separate from shape

The fit decides inertia and contact; it must not decide mass. Give every part an
explicit share of an authored total from body-segment parameter data. Deriving
mass from capsule volume makes a thin torso lighter than a stubby limb, and no
joint tuning recovers from that.

## 7. Prove it — numerically and in a frame

Both halves, every time. Neither alone is evidence.

**Numeric probe**, per part: the driven joint's name, the radius, the `halfHeight`
and the **offset from the joint to the body's centre**. That last number is the
one that catches a part built in the wrong place, and it is the one to diff
between characters. Assert, don't eyeball:

- every part, **as the SOLVER reports it**, matches the fit that was authored:
  same radius, same halfHeight, centre within a millimetre. Read it back from the
  physics world, not from the table you filled in — a table compared against
  itself is the same table twice, wearing a lab coat.

  Do NOT settle for counting parts. A creation loop cannot skip a row, so the
  count is almost always right; what goes wrong is a part built in the WRONG
  PLACE, with the count still correct. Count-only gates are why "the head has no
  collider" survived as a diagnosis while the collider sat on the neck the whole
  time;
- no part's centre is further from its joint than that joint's own length;
- mirrored parts have mirrored offsets;
- total mass equals the authored total;
- any part whose `halfHeight` clamped to its floor is logged as "this part is a
  sphere" — acceptable for a round part, a red flag for a long one.

**Headed frame**, with collider wireframes over the mesh, per character: front
and side at minimum, and one settle watched to the end. Load
`visual-verification-gate` for what counts as evidence; use an isolated bench
(`dev-lab-authoring`) rather than the game, and drive the collapse with no
impulse at all — a nudge from the bench is the bench choosing the fall.

## 8. Failure catalogue

| Symptom | Cause |
|---|---|
| A part's capsule sits on the neighbouring part; the part itself is bare | The tail node is not a bone (§1) and a silent fallback invented one. |
| Every attempt at a capsule comes out a sphere | Radius exceeds the halfExtent along the bone, `halfHeight` clamps to its floor. The part is not its bone (§0). |
| The part is covered but the capsule is far too wide | Radius derived from bone LENGTH instead of the mesh's perpendicular extent. |
| One capsule swallows an accessory | Accessory skinned to that joint; no percentile trim or part filter (§4). |
| Everything is 100× or 0.01× | Absolute metres against a rig authored in other units (§3). |
| Two identical limbs measure differently | Measured in a live pose instead of the bind pose (§3). |
| The same bend reads + on one limb and − on its mirror | Hinge axis derived against "up" for a near-vertical limb (§3). |
| A limb spins freely / folds through the trunk | Joint limits and contact rules — not a fitting problem; see the joint-behaviour work. |
| The manikin builds on a new rig but falls oddly, and nothing warned | Roles resolved by name with no validation; a role is missing or bound to a twist helper (§2). |
| The mesh is fine, the bodies are fine, the drawn body is a smear | The write-back, not the fit. Measure the DRAWN joints in world space, not the mesh node. |

## 9. Checklist

Before building bodies:

- [ ] Roles listed for this creature; mapping resolved explicitly, by alias, or
      by topology — and **validated** (§2).
- [ ] Helper/twist/IK joints excluded.
- [ ] Bind pose entered for measurement and fully restored after.
- [ ] Reference length measured from the rig; every fit expressed as a factor.
- [ ] Axes derived from the rig, not assumed.

Before believing them:

- [ ] Shape taken from the mesh, or from factors recorded WITH the character they
      were measured on.
- [ ] Numeric probe printing joint → centre offsets, radii, `halfHeight`s and full lengths.
- [ ] Solver collider count equals role count.
- [ ] Mirror, mass-total and clamp assertions pass.
- [ ] Headed front + side frame with wireframes, per character.
- [ ] One full settle watched to the end, driven with no impulse.
