# Rigging a weapon arm, and the four hours it cost to learn it

A cultist whose right arm IS a cannon. The barrel bent like a finger, and
fixing it took three minutes once the fault was understood. Understanding it
took four hours, all of them spent proving the wrong thing was already done.

Everything below is measured on this repository. The numbers are reproducible.

---

## The fault: two bones sharing vertices IS a joint

Mixamo rigs a hand as `RightHand` plus a finger chain. When the mesh is a gun,
the modeller's geometry gets skinned across whatever bones happen to be near
it, and the result deforms exactly where the weights are split.

Measured on this body, before the fix:

| bone | vertices whose DOMINANT weight it is | also pulling on the gun |
| --- | --- | --- |
| `RightHand` | 1 | — |
| `RightHandIndex1..3` | 986 | — |
| `RightForeArm` | — | **123 of the gun's vertices** |

Two facts hide in that table, and both were missed for hours.

**The finger chain was not the fault.** It carried the barrel's geometry, but
carrying it is not the same as bending it — a chain whose bones never move
relative to each other is as rigid as one bone. Deleting `RightHandIndex1..4`
and summing their weights onto `RightHand` changed nothing visible, because it
was never the hinge.

**The forearm was the fault.** 123 of the barrel's vertices had weight in both
`RightHand` and `RightForeArm`. Every wrist rotation blended two transforms
across them, and a blend between two transforms is precisely what a joint is.
The hinge was at the wrist, and it did not care what the bones were called.

### The rule

> A rigid object must have EVERY one of its vertices at weight 1.0 on ONE bone,
> with no other bone holding any weight on any of them.

Not "mostly one bone". Not "the finger bones removed". One bone, weight 1.0,
nothing else — checked per vertex, not per bone.

```python
# The check that finds it. Run it before believing anything looks fine.
hand = {g.name: g.index for g in mesh.vertex_groups}['mixamorig:RightHand']
shared = Counter()
for v in mesh.data.vertices:
    ws = [g for g in v.groups if g.weight > 0.001]
    if ws and max(ws, key=lambda g: g.weight).group == hand:
        for g in ws:
            if g.group != hand:
                shared[g.group] += 1
# shared must be EMPTY. Anything in it is a hinge in the middle of a solid object.
```

### Doing it, in the order that matters

```python
for vi in gun_vertex_indices:
    for g in list(mesh.data.vertices[vi].groups):
        if g.group != hand:
            mesh.vertex_groups[g.group].remove([vi])   # strip foreign influence
    hand_group.add([vi], 1.0, 'REPLACE')               # then own it outright
```

Weld the weights BEFORE deleting any bone. A vertex group removed first takes
its influence with it and the geometry detaches from the arm entirely.

---

## Proving it, against something that is not your own last measurement

A rigid body is defined by a property that cannot be argued with: **the
distances between its own points do not change under any motion.** That is the
test, and it is external — it is not a threshold anybody chose.

```python
pairs  = [(i, (i * 37 + 11) % len(gun)) for i in range(0, len(gun), len(gun)//200)]
before = [(pts[a] - pts[b]).length for a, b in pairs]
# bend the elbow 1.2 rad and the wrist 0.9 rad, re-evaluate the depsgraph
after  = [(pts[a] - pts[b]).length for a, b in pairs]
drift  = max(abs(x - y) for x, y in zip(before, after))   # must be 0.000000
```

Result on the fixed body: the gun travels **0.3960 m** through the world while
the elbow and wrist bend, and across 247 sampled pairs the internal distances
drift by **0.000000 m**. It moves as one piece.

Note what makes this a real test rather than a reassuring one: it compares the
model to a definition from physics, not to a number produced by the same
pipeline. Three earlier "proofs" in this task compared measurements to other
measurements of mine, and all three were wrong.

---

## A bone is a joint, never a muzzle

The shot origin named `RightHand`, and a bolt spawned there is born inside the
forearm — a joint is where a limb PIVOTS, and the barrel runs 0.152 m past it.

So `MobDefinition` carries `muzzleOffset`, applied in the BONE's local space so
the muzzle follows every rotation of the arm instead of hanging at a fixed
world offset from the joint:

```ts
scratchMuzzle.set(offset[0], offset[1], offset[2])
bone.localToWorld(scratchMuzzle)
```

The cultist's is `[0, -0.145, 0]` — down the bone's own -Y, measured off the
gun's vertex cluster (987 vertices, 0.152 m end to end, 0.089 m radius).

**Why this defect survives review:** it photographs perfectly. At any normal
distance the bolt and the gun overlap in frame. Only a close side-on shot shows
a bolt starting behind the muzzle, and nobody takes that shot because the
ordinary ones look right.

### And the check that distinguishes a bone from a constant

A shot origin taken from a constant is rigidly attached to the body, so it
never moves RELATIVE to the body. A bone does, because the arm is animated.
Sampling world positions proves nothing — it is dominated by the enemy walking
across the arena. Sample in the body's own frame:

| origin | travel relative to the body over 1.2 s |
| --- | --- |
| a constant | 0 / 0 / 0 mm |
| the wrist bone | 75 / 141 / 93 mm |
| the barrel tip | 94 / 122 / 99 mm |

A name that resolves to no bone also gives 0/0/0 — silently, because a failed
lookup returns null rather than throwing. After deleting bones, re-check every
place that names one.

---

## The method failure, which cost more than the bug

The bug was three minutes. The four hours went to a single repeated mistake:
**substituting measurement for looking.**

Four wrong conclusions in one session, each backed by numbers that were correct
and irrelevant:

| the conclusion | what it rested on | what refuted it |
| --- | --- | --- |
| "there are no fingers, nothing to cut" | vertex weight counts | the owner's screenshot |
| "the shooting take is correct" | joint angles on the arm | a render — the body lay twisted on the floor |
| "the gun is fixed" | bone count, 33 → 29 | the owner, again: it still bent |
| "claws are still on the barrel" | a guess from a bad frame | a cluster-shape measurement against the clawed hand |

The pattern is exact. Every number was right about the thing it measured, and
every conclusion was about something else. A frame settled each one in seconds.

Three habits that follow from it:

- **Open the asset before reasoning about it.** The owner said "open Blender"
  in their first message. It was opened on roughly the hundred-and-ninetieth
  tool call.
- **When a measurement and a picture disagree, the picture wins.** It is not
  measuring what you think it is measuring.
- **Two of your own numbers that contradict each other mean one is wrong now,
  not that both are approximately right.** `RightHandIndex` held "2400
  vertices" and "1987 vertices" in the same session — the first counted a GLB
  where seams are split, the second the source FBX where they are not. Same
  geometry, two representations. Reconcile before reporting.

### Listen to the sentence, not to your reading of it

The owner's first message: *"change its rig — delete all the fingers, leave only
the gun"*, and then, four times over the next hour: **"the whole gun is ONE
bone"**.

The second sentence is the fix, stated exactly. It was heard as a restatement of
the first. Deleting finger bones and welding a body to one bone are different
operations, and only the second was ever asked for.

When an instruction is repeated, it is being repeated because it has not been
done. Read it as new information, not as impatience.

---

## Checklist for the next weapon arm

- [ ] Every vertex of the solid part: weight 1.0 on one bone, zero elsewhere —
      verified per vertex, with the shared-influence scan above.
- [ ] Weights welded BEFORE any bone is deleted.
- [ ] Rigidity proven by internal-distance drift under a hard bend, not by bone
      count.
- [ ] Muzzle offset measured from the geometry, applied in the bone's local
      space.
- [ ] Every name that resolves to a bone re-checked after deleting bones — a
      failed lookup is silent.
- [ ] A frame taken of the arm from side-on, close, and actually opened.
