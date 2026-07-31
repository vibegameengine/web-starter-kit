# Measuring a part from the skin

The concrete recipe behind SKILL.md §4: given a rigged mesh and a joint, produce
the capsule that fits the geometry that joint actually moves. It works the same
offline (a tool reading the asset file) and at load (the engine reading the
scene) — only the accessor API differs.

## The one idea

A joint's geometry is the set of vertices it moves. The skin tells you which
those are, and the inverse bind matrix puts them in that joint's own frame — the
frame the capsule is authored in. Everything else is a bounding box.

## Steps

### 1. Collect the vertices that belong to the joint

For every skinned primitive, for every vertex, sum the weights whose joint index
points at the joint you are measuring:

```
weight = Σ WEIGHTS_0[slot] where JOINTS_0[slot] == jointIndex
keep the vertex if weight ≥ 0.5
```

The 0.5 threshold means "this joint dominates the vertex". Notes:

- `jointIndex` is the index **within the skin's joint list**, not the node index
  and not a bone index in the engine's skeleton. Resolve it by finding your joint
  in that list.
- A mesh may have several primitives and several skins. Measure across all of
  them, but only those bound to the skin you resolved the index in.
- Rigs with more than four influences per vertex use additional
  `JOINTS_n`/`WEIGHTS_n` sets. Sum them too, or knowingly ignore the tail.
- If a part comes out with very few vertices, the threshold is wrong for this
  rig (heavily blended skinning) — lower it and say so, rather than shipping a
  capsule fitted to a handful of vertices.

### 2. Put them in the joint's frame

```
localPosition = inverseBindMatrix(joint) × meshVertexPosition
```

The inverse bind matrix is exactly the mesh→joint transform at bind time, which
is why this needs no pose walking and no world matrices. Two cautions:

- it maps from the **skin's** space; if the mesh node carries its own transform,
  apply the same convention the runtime uses;
- glTF matrices are column-major. Transposing them silently produces a plausible
  box in the wrong place — a good reason to sanity-check that the joint's own
  origin lands near `(0,0,0)`.

### 3. Reduce to a box, with percentiles

Sort each axis and take, say, the 2nd and 98th percentile rather than min/max:

```
extentAxis = percentile(values, 0.98) − percentile(values, 0.02)
centreAxis = (percentile(values, 0.98) + percentile(values, 0.02)) / 2
```

Raw min/max is dominated by the most extreme protrusion — a nose, a spike, a
strap, one vertex welded in the wrong place. The trim costs a sort and removes an
entire class of "why is this capsule enormous" investigations.

Keep both numbers: the trimmed box is what you fit; the raw box tells you how
much geometry you are leaving outside, which is what you report.

### 4. Derive the capsule — THE canonical formula

This block is the single source of truth for the arithmetic. Nothing else in this
skill restates it; everything else links here.

Vocabulary, fixed, because the two words are one letter apart and mean different
things:

- **extent** — a full box dimension (crown to jaw).
- **halfExtent** — half of one, along some direction.
- **radius** — the capsule's cap radius.
- **halfHeight** — half the capsule's CYLINDRICAL part only, which is what a
  physics engine's capsule constructor takes. It excludes the caps.
- The capsule's full length is therefore `2 × (halfHeight + radius)`. Compute it
  every time and compare it against the box — it is the one number that makes a
  wrong fit obvious.

```
axis            = the BONE direction, in the joint's frame          // never the box's
halfExtent⟂     = max over the two directions perpendicular to axis
                  of ½ × the box extent in that direction
halfExtentAlong = Σ over x,y,z of |axis[i]| × ½ × extent[i]         // support function
radius          = halfExtent⟂
halfHeight      = max(floor, halfExtentAlong − radius)
centre          = the box centre, in the joint's frame
fullLength      = 2 × (halfHeight + radius)
```

`halfExtentAlong` is the **support function** of the box along the axis, not the
extent of whichever axis happens to be nearest. Projecting onto a box axis
instead is the classic error: on a head whose bone leans 20° out of the box's
long axis it under-measures by about 20%, and the capsule ends up short at both
ends while looking plausible in a still.

`halfHeight` hitting its floor means the part is round — the capsule degenerates
into a sphere. That is a legitimate outcome for a head or a pelvis. It must be
**logged**, because the same arithmetic silently produces a sphere when the
radius was wrong (SKILL.md §0).

Report the fit both ways: in rig units, and divided by a measured reference
length so the numbers are transferable.

### 4a. Check the fit against this worked example

The bench humanoid's head: bone length `0.196`, bone direction `(0, 0.941,
0.338)`, trimmed box `0.158 × 0.246 × 0.241` centred at `(0, 0.077, 0.010)`.

```
halfExtent⟂     = max(0.158, 0.241) / 2                = 0.120
halfExtentAlong = 0.941 × 0.123 + 0.338 × 0.1205       = 0.156
radius          = 0.120
halfHeight      = 0.156 − 0.120                        = 0.036
fullLength      = 2 × (0.036 + 0.120)                  = 0.313
```

Wrong answers and what they mean: `0.26` — you projected onto the box's longest
axis instead of the bone; `0.49` — you used an extent where a halfExtent belongs;
a clamped `halfHeight` — you took the radius from the bone length instead of the
mesh.

### 5. Sanity-check the fit against the box

Before accepting it, ask what fraction of the trimmed box the capsule covers, and
which direction the leftover sticks out in. A capsule aligned to a limb cannot
cover a part that is fat across two axes; if the leftover is large and points
somewhere that will touch the ground, that is the moment to consider a different
axis, a bigger radius, or a hull.

## Working with compressed and quantized assets

Production pipelines routinely quantize positions and compress buffers. Read the
asset through a loader that applies the extensions (meshopt, Draco, quantization
transforms) rather than the raw buffer, or every measurement is in some internal
integer space. Symptom: dimensions that are suspiciously round, huge, or all
equal.

If the runtime asset differs from the source asset (an optimizer in the build),
measure the one the game actually loads — the source file is a different file.

## Offline vs at load

The same recipe, two placements:

- **Offline** (a script over the asset): produces numbers you paste into a table,
  reviewable in a diff, zero runtime cost. Right when one character ships.
- **At load** (inside the spec builder): no table, works for characters you have
  never seen. Costs one pass over the skinned vertices per model — cache it by
  asset identity, not per instance, or every spawned body re-measures the same
  mesh.

Whichever you use, the numbers must be printable at runtime (a DEV probe), or the
first "the collider is in the wrong place" report has nothing to look at.
