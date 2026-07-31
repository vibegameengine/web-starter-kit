---
name: threejs-authored-vegetation
description: Render explicitly placed Three.js vegetation with stable species identity, terrain-aware shading, rooted wind, and distance budgets. Use when building grass, trees, vines, foliage, or wind deformation without generating scene placement procedurally.
---

# Three.js Authored Vegetation

Keep composition ownership outside this skill: placement and transforms must come from authored scene data. This skill owns only the rendering, local structure, and motion of an already placed plant or vegetation group.

## Workflow

1. Define the visible species identity, scale range, root anchor, material response, and distance envelope.
2. Reuse authored geometry or instances for repeated plants; do not invent world positions at runtime.
3. Match grass and foliage base height to the host terrain through declared local or world-space data.
4. Use macro color variation and translucency sparingly so vegetation groups read as one species.
5. Deform wind from a fixed root or petiole: low-frequency bend first, then limited tip flutter.
6. Fade or cull by distance with an explicit budget and no popping at the design camera.
7. Inspect root contact, normals, wind in motion, shadow response, and a no-wind still frame.

## Rules

- Preserve a plant's anchored root while its blade, leaf, or branch moves.
- Separate whole-plant sway, branch deformation, and leaf flutter.
- Keep textures and bark/leaf scale stable across geometry variants.
- Prefer authored clusters and instance reuse over runtime scatter or seeded placement.

## Reject

- Foliage slides at its root or rotates around a card center.
- Grass floats above or clips through terrain.
- Wind makes every plant move in identical phase.
- Placement is generated instead of supplied as explicit authored scene data.
