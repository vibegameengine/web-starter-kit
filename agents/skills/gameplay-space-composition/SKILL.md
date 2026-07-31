---
name: gameplay-space-composition
description: Design and build dense, navigable, reference-matched gameplay spaces from a scene image or level brief. Use when a blockout, greybox, map, arena, encounter space, environmental layout, or scene dressing must communicate deliberate player routes, clear playable space, boundaries, cover, landmarks, and dense world masses rather than a sparse collection of props. Use alongside img2threejs for reference reading and threejs-scene-authoring for explicit hand placement and headed verification.
---

# Gameplay Space Composition

## Core rule

A blockout is an implementation mode, not an excuse for an empty level. Even with only
neutral primitives, it must express the playable space: where a player can move, what
contains that movement, what interrupts sightlines, where the world feels dense, and
which empty areas are intentionally open.

Use this skill with:

- `img2threejs` to read a supplied image and preserve its camera-facing composition;
- `threejs-scene-authoring` to author every transform deliberately and inspect headed
  frames after each placement step;
- the applicable camera, navigation, or performance skills when the task includes them.

Do not treat either a source image or a visual blockout as proof of hidden gameplay
rules. Record uncertainty and keep unproven choices reversible.

## Define the spatial contract before placing geometry

Write a short layout record. Exclude HUD and other screen overlays. For every visible
world region, classify it as one or more of:

| Class | Question it answers |
| --- | --- |
| route | Where can the player or unit deliberately travel? |
| open arena | Where is movement, combat, interaction, or attention meant to happen? |
| boundary mass | What stops, frames, or redirects movement? |
| density mass | What makes the space feel inhabited or overgrown while staying out of the route? |
| cover / occluder | What breaks sightlines or creates a local positional choice? |
| landmark | What orients the player and anchors the composition? |
| transition | Where does the player enter, leave, or turn into another space? |

For each named route, record its visible endpoints, direction, intended width, adjacent
boundaries, and every intentional widening, choke, bend, or crossing. For each density
mass, record its footprint, edge shape, height band, and the route it must not invade.
Name visible forms neutrally until the asset identity is certain.

State the play in one sentence before code: for example, “enter from the lower edge,
cross the open centre, choose cover at the left landmark or the right boundary, then
leave through the upper passage.” If this cannot be stated, the space is not designed
yet.

## Build in gameplay order

1. **Playable negative space.** Mark the entry, exits, route corridors, arena, approach
   space around objectives, and reserved camera visibility. Do not fill this space just
   because the surrounding world must be dense.
2. **Containment and route shape.** Place cliffs, walls, fences, water, buildings, dense
   forest edges, or other boundary masses that make the routes legible. Linear boundaries
   require exact visible endpoints and direction.
3. **Landmarks and positional choices.** Place the large structures, rocks, wrecks,
   trees, ruins, or other masses that frame the arena, break sightlines, create cover,
   or orient the player. Keep resources, interactions, and route transitions accessible
   from the intended approaches.
4. **Density bands.** Fill non-playable edges, dead zones, backdrops, and boundary
   interiors with deliberate belts and clusters of vegetation, rock, debris, or other
   environmental proxies. Dense does not mean uniform: shape edges, leave purposeful
   gaps, and step heights to make a readable silhouette.
5. **Local rhythm.** Add the smaller repeated pieces that connect large masses to the
   ground and prevent accidental empty voids. A cluster must have a role: reinforce a
   boundary, soften a landmark, signal danger, provide cover, or lead the eye.
6. **Traversal audit.** Trace every named route from its entry to exit. Check that no
   boundary, density object, or landmark blocks a required corridor, ramp, interaction
   approach, or camera view. Fix the actual offending element; do not compensate by
   widening unrelated space.

When the requested pass is cube-only, use cuboids as occupancy proxies for every required
spatial role. This still includes repeated trees, rocks, wrecks, and debris as simple
explicit masses when they are necessary for density or route readability. Do not upgrade
them into detailed semantic models unless that pass is requested.

## Author density without procedural scatter

Every transform is chosen and stored explicitly. Rendering an authored list with
instancing is encouraged; generating locations, random jitter, loops that invent
placement, or runtime decoration is not.

```ts
const AUTHORED_WORLD_ELEMENTS = [
  // Frames the north edge; keeps the central route clear.
  { id: 'north-tree-belt-a', role: 'density-mass', position: [-8, 0, -14], size: [5, 7, 4] },
  // Creates a left-side cover choice without closing the centre.
  { id: 'west-rock-cluster-a', role: 'cover', position: [-9, 0, -2], size: [3, 2, 4] },
];
```

The data must remain readable enough to answer why every element exists. A repeated family
may share geometry and material; it may not share an invented placement algorithm.

## Composition tests

Judge the scene in this order:

1. **Route read:** Can a first-time player identify the traversable corridor and its turns
   without a debug overlay?
2. **Density versus clarity:** Do masses make the world feel enclosed and inhabited while
   leaving the intended arena, approaches, and camera sightlines open?
3. **Spatial choices:** Do cover, occlusion, height, or alternate approaches create a
   meaningful positional decision rather than decorative clutter?
4. **Reference structure:** Do cropped edge masses, empty areas, landmarks, and linear
   boundaries agree with the reference at its camera framing?
5. **Three-dimensional validity:** Are all pieces grounded, non-intersecting except for
   deliberate embedding, and sensible from front, side, back, and orbit views?

## Visual loop and acceptance

Before editing, define a visual test contract with the reference camera, the intended
routes, the active scope (for example cube-only or full dressing), and evidence paths.
Work one named placement intent at a time. After every such step, capture a headed frame,
open it, and compare it with both the layout record and the reference.

Accept only when all are true:

- the route network is continuous and intentionally shaped;
- required interaction or combat space has clear approaches and is not ringed by clutter;
- density reads as authored masses with deliberate gaps, not sparse dots or a uniform wall;
- landmarks frame and orient the play space without sealing routes or hiding the camera;
- the reference-facing composition, linear-boundary endpoints, and focal/empty areas match;
- every placement is explicit authored data and has passed a headed visual inspection;
- the current requested fidelity scope is respected.

If a scene is sparse, do not add random decoration. Return to the spatial contract, name
which boundary or density role is missing, author that role explicitly, and verify again.
