# Placing an authored prefab into a generated world (three.js)

**KIT LESSON.** Nothing here is specific to this game. It holds for any three.js
project that authors a hand-made piece of world and then lets a generator decide
where that piece stands.

Everything below was paid for in one session, placing the hand-authored cathedral
yard — its masonry, its dancers, its player spawn and its three waves — into a
procedurally generated dungeon floor 350 m across. Every number in this document
was measured, and every defect reached the owner's screen before it reached a
test.

---

## 1. A prefab is ONE object, and everything inside it is local

The definition is short and it is the whole discipline:

> A prefab can be placed anywhere, at any angle, any number of times. Inside it,
> every coordinate is relative to its own origin. The world chooses where it
> goes and then keeps out.

The owner's words, after watching a dancer stand buried to the chin in a floor:
*«каждый раз пересчитываешь положение всего, что переносишь»* — you recompute
the placement of every single thing you move.

That was exactly what the code did. One yard, four independent derivations of
where it stood:

| what | where its placement was worked out |
| --- | --- |
| the masonry | in the scene, as a `<group position rotation-y>` |
| the dancers | in the fight component, as a second group |
| the player spawn | in a spawn helper |
| the wave bodies | in a third place, applied to a table of coordinates |

Four copies of one fact agree on the day they are written and drift afterwards.
They drifted on the axis one of them forgot — height — and the dancer sank into
the tiles.

**The shape that works:**

```tsx
export function YardPrefab({ children, placement }) {
  return (
    <group {...yardTransform(placement)}>
      <GeneratedCathedralArena />
      {children}
    </group>
  )
}
```

`yardTransform(placement)` is the ONE transform. Everything the prefab owns is a
child of that group in the prefab's own coordinates, and nothing inside knows
where the prefab stands. That last property is what makes it a prefab rather
than four things that happen to agree today.

For contents that cannot be children — a body that must live inside the fixed-tick
simulation, for instance — the same component is mounted a second time with the
same `placement`, and the contents go in as `children`. The transform is still
written once.

---

## 2. Points inside the prefab are read through the SAME transform

Meshes are placed by the group. Points — spawn markers, patrol nodes, anchors —
are read in code. Those two must not be two implementations of one turn.

```ts
// local -> world, for every authored point the prefab owns
export function intoWorld(local, placement) {
  const [x, z] = rotateLocal(local[0], local[1], placement.quarter ?? 0)
  return [x + placement.position[0], z + placement.position[1]]
}
```

The owner's instruction, verbatim: *«тебе надо ставить точки спавна, а
спрашивать их уже в мире, с новой системой координат — но тем же самым кодом»*.

**Never write your own rotation.** The one written by hand here was the INVERSE
of the layout's own `rotateLocal`: `turned(·, 1)` equalled `rotateLocal(·, 3)`.
Measured over eight generated floors, the player's spawn landed **24 m away, on
top of the cathedral**, on six of them. The convention is not a matter of taste —
the heightfield is sampled as `rotateLocal(worldOffset, (4 - quarter) % 4)`, so
local→world is `rotateLocal(local, quarter)`, and `rotation-y = quarter · π/2`
is the same turn again for three.js.

A test already pinned the correct convention. It was testing the function the
game did not call.

---

## 3. Before you mount it, find out who already mounts it

An hour went into a level that drew every wall of the yard twice: the yard's own
masonry, and the dungeon's idea of the same room, interpenetrating. The cause
was one line that had been there all along — the dungeon's blockout component
already mounted the yard's mesh for every arena on the floor, at the right
position, height and quarter.

The owner found it by reading, in about a second: *«не может ниоткуда взяться
2 геометрии… где ты создаёшь копию и зачем»*.

```bash
grep -rn "<GeneratedCathedralArena" src
```

One command. It was run after roughly a hundred tool calls of probes, captures
and reasoning.

**Rule: when the symptom is "there are two of something", read the source. A
measurement cannot tell you that a second copy exists somewhere else in the
tree; a grep can, immediately.**

---

## 4. The third axis is the one that gets dropped

A placement is `position`, `rotation`, and **height**, and height is the one
that is quietly missing, because the prefab was authored standing on y = 0 where
its own floor height is zero and looks like a universal fact.

Two separate defects in one session, both height:

- the prefab's contents were mounted at `y = 0` while the dungeon floor under
  them stands at 1.75 m — the dancer buried to the chin;
- room enemies were given `dungeonLevelY(zone.level)`, the room's NOMINAL floor
  from the plan, instead of the height of the collision grid the player actually
  walks on — bodies standing in the air over the tiles.

**Height comes from the collision surface, never from the plan.** The grid is
what the solver, the traces, the bodies and the player all read; a height derived
anywhere else is a second opinion about where the floor is, which is the fault
this whole document is about.

The comment that defended the plan height had been true once — the arena's own
height grid really did know nothing about a dungeon room a level up. It stopped
being true when the level began installing the whole floor's grid into that same
module, and nobody re-read it.

---

## 5. Authored coordinates in a foreign unit system: keep ONE source

The yard's spawn was authored in Quake units as `[-384, 640, 0]`, and copied by
hand into the prefab as metres: `[-384 * QUAKE_TO_WORLD, 0]`.

Both halves of that copy were wrong. The conversion flips X and swaps the
remaining two axes, so the correct metres are **(+12, 20)** and the copy said
**(−12, 0)** — a mirrored X and a missing 20 m.

Neither error is guessable by looking at the triple, and neither is visible in
review. Keep the authored numbers in their authored unit, once, and derive:

```ts
export const YARD_PLAYER_SPAWN_Q3 = [-384, 640, 0]
export const YARD_PLAYER_SPAWN = (() => {
  const [x, , z] = q3ToThree(YARD_PLAYER_SPAWN_Q3)
  return [x, z] as const
})()
```

---

## 6. The prefab's own size is a constant that leaks into the world

The authored yard is 60 m across and stood at the world origin while it was the
only world. Its half extent, 30, ended up written into code that has nothing to
do with the yard. Every one of these was found by a player, not by a test:

| where | what it did |
| --- | --- |
| shot trace bounds | `Math.abs(x) > 30` was true on the first 0.25 m step, because the fight stands at x = −154. **Every pellet died in the muzzle**: 0 decals and 0 kills in the level against 157 and 5 in the arena, with the target 1.3 m away |
| blood soak canvas | mapped the world as `(world + 30) / 60`, so a stamp landed near **−4237 px on a 2048 px canvas** and nothing ever soaked into the stone |
| ragdoll physics floor | iterated the yard's `64 × 64` cells, so on a 350 m floor Rapier had a floor in one corner and **corpses fell through the world everywhere else** |
| the sun's shadow camera | `shadow-camera-left/right/top/bottom = ±20` — the frame covers the origin, the fight is 154 m away, so **the level had no shadows at all** |

The owner's description of the blood one is the best diagnostic sentence in this
document: *«двояко — одновременно ощущение, что сдвинуто и что масштаб не тот»*.
A shift **and** a scale together is an affine mismatch, and it points straight at
a hand-written world-to-texture map.

**Ask the world how big it is.** One accessor, one answer, every caller.

---

## 7. Do not compute these constants by hand at all — measure the geometry

The instruction that finally settled the blood layer: *«это вообще никак не
должно считаться руками, эти постоянные должны автоматом строиться буквально из
геометрии»*.

An intermediate version asked the collision grid for its half extent. Closer,
and still wrong: the grid is square and centred on the origin, a floor is
neither.

```ts
export function registerBloodFloor(object: THREE.Object3D): void {
  object.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(object)   // walks instanced meshes
  // the box IS the mapping, for the canvas and the shader alike
}
```

`Box3.setFromObject` expands over `InstancedMesh` instances, so a floor drawn as
one instanced slab mesh measures correctly without anyone telling it how big the
level is. Draw the stamp in METRES on a scaled canvas: a floor that is not
square has different pixels-per-metre on each axis, and a round pool stamped
with one scale comes out an ellipse.

---

## 8. Two rasters describing one wall

The generated floor draws its stone on the kit's raster — `CELL = 1.75` m, on the
kit's own origin, then slid by the fractional offset that recentres the floor.
The collision grid is `0.9375` m and pinned to the world origin.

`1.75 / 0.9375 = 1.8667`. The pitches do not divide into each other and the
phases do not line up, so a wall's face in the collision grid sits up to **half a
cell — 0.47 m —** from the face that is drawn. A shot's impact point comes from
the grid; the wall the player sees comes from the raster. Blood stands off the
wall, and a clean strip of floor is left along its base.

The authored yard does not have this problem at all, and the reason is worth
copying: **its collision grid is baked from its own mesh**, cell for cell. One
description of one wall.

A failed repair worth recording: making each collision cell take the highest
solid over its own AREA rather than at its centre. That makes every boundary
cell solid, so walls grow INTO rooms by up to a cell — the owner named it
immediately as pushing the wrong way, and quantisation error here is two-signed
anyway. It also cost five times the queries and timed out a five-second test.
The real repair is to align pitch and phase, or to derive one raster from the
other.

---

## 9. Mounting order, refs, and the fixed tick

**Build state FROM the floor, never correct it afterwards.** The fight's state
was created before the collision grid arrived and then patched from an effect —
a gameplay write outside the fixed tick. Moving the correction earlier did not
help, because the refs holding that state are created on the component's FIRST
render, when the grid is still null. The fix was structural: extract a component
that the scene does not render until the floor exists, so `createInitialState`
can ask the floor where the player stands and there is nothing left to correct.

**Seed physics from CURRENT matrices, not last frame's.** A ragdoll woken on the
fixed tick copied each bone's `matrixWorld` into its rigid bodies. Three writes
those matrices during render, which happens after the tick — and on the tick a
body dies its placement has just changed, because a living enemy is drawn at its
group's origin while the group carries the transform, and a dead one places
itself while the group drops to identity. Seeded from the stale matrix, the
corpse appeared at rest at the origin and then either dropped in from above or
arrived inside the floor. `bone.updateWorldMatrix(true, false)` before seeding
walks the ancestors first and costs one matrix chain per segment, once.

**A shared stage must not paint over what the scene owns.** `<color
attach="background">` writes `scene.background` every time that element renders.
The scene's own gradient sky set the background once, in an effect; the stage
re-rendered three seconds later — because the fight mounts when the grid arrives —
and the sky went black from that second onwards. Logged at the seam:
`background === texture` true, then `Color` on the next tick. Give the stage a
`background={null}` so a scene that paints its own sky keeps it.

---

## 10. How this class of defect is found, and how it is not

**A shader that does not compile is an INVISIBLE MESH.** Uniforms declared
`float` while the body used them as `vec2` killed the floor material's program.
Nothing threw, no page error was raised, the console carried only warnings, and
the entire world stopped being drawn — sky, mobs and blood decals still there.

**A counter cannot see an unrendered world.** The hit probe reported 111 decals
and 5 kills for that same build, with no page errors, and that was presented as
proof. Those numbers come from the simulation, which does not care whether
anything was drawn. The owner opened the level and saw demons standing in an
empty sky.

**Measure BEHAVIOUR in the system's own lab; a scene proves INTEGRATION and its
evidence is a frame.** Planning to judge a 0.47 m wall offset by eye, in a
screenshot, in a scene with a live fight in it, earned the correct response:
*«как ты себе это вообще представляешь?»*

**Sweep the seeds.** Every measurement in this work came from generated floor
seed 1 — one of only two of the first eight whose start yard has quarter 0, and
quarter 0 is the single case where a wrong rotation and a right one agree. Two
defects lived there for an afternoon. Let the lab take `?seed=` and look at a
turned one.

---

## Checklist for the next prefab

- [ ] One transform, applied once, to a group. Contents are children in local coordinates.
- [ ] Points read through the same transform as the meshes — no second rotation.
- [ ] `position`, `rotation` AND height, with the height taken from the collision surface.
- [ ] Authored coordinates stored once, in their authored units, and derived from there.
- [ ] `grep` for who already places this thing before placing it.
- [ ] No world-size constant of the prefab's own outside the prefab.
- [ ] Anything mapping the world to a texture measures the geometry instead of being told.
- [ ] One description per wall: bake collision from the drawn mesh, or draw from the collision grid.
- [ ] State built from the floor, not corrected after it arrives.
- [ ] Looked at, headed, on a seed where the prefab is turned.
