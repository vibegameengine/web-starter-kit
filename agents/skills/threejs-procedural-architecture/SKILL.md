---
name: threejs-procedural-architecture
description: Build modular Three.js architectural assets from an inspectable massing and facade plan. Use for a reusable building, ruin, wall, facade, roof, arch, trim, or kit; never use it to generate a scene layout, world placement, or runtime decoration.
---

# Three.js Procedural Architecture

Generate an asset from a semantic construction plan. Keep level composition separate: this skill produces a local-coordinate prefab; an authored scene chooses whether and where that prefab appears.

## Asset pipeline

```text
dimensions and module settings
  -> mass plan
  -> exposed-surface analysis
  -> facade and roof plan
  -> module registry
  -> material-slot mesh compilation
  -> local-coordinate asset
```

## Workflow

1. Define the asset's real or perceptual dimensions, silhouette, and local origin.
2. Separate massing, facade rhythm, openings, roof, and ornament into named layers.
3. Resolve exposed faces before assigning facade modules; never spend detail on hidden internal faces.
4. Give every module semantic anchors and construction depth in the asset's local frame.
5. Compile compatible repeats by material slot without erasing intentional material boundaries.
6. Preserve UV density, hard edges, apertures, and construction seams through the mesh build.
7. Export or mount the result as a unit-scale local prefab; choose its world transform only in the authored scene.

## Rules

- Use deterministic parameters for asset variants; variation may select valid modules, never repair invalid geometry.
- Do not generate building positions, rotations, routes, districts, city blocks, or scene dressing.
- Do not use random placement, scatter, or loops that invent world composition.
- Keep roots at unit scale; put dimensions in mesh geometry and module contracts.
- Record module count, triangle count, material slots, bounds, and shadow behavior.

## Acceptance

Inspect silhouette-only, flat material, grazing light, close corners, roof transitions, openings, UV density, and the asset from every relevant side. Verify that variants retain the same architectural identity and contain no overlaps, floating detail, or unowned surfaces.

## Routing boundary

Use scene-authoring guidance for all level placement and composition. Use procedural-geometry guidance when the task is only a reusable profile, sweep, or mesh writer rather than an architectural kit.
