---
name: threejs-precipitation-surfaces
description: Couple Three.js rain or snow with the surfaces it visibly changes. Use for precipitation volumes, wind, accumulation, wetness, puddles, ripples, splashes, snow caps, and shared weather state; do not use for isolated decorative particles.
---

# Three.js Precipitation Surfaces

Make weather one shared event: particles, surface masks, material response, impacts, and lighting must agree on wind, progress, and timing.

## Build order

```text
weather envelope
  -> precipitation volume
  -> world or object surface mask
  -> material or displacement response
  -> impacts and residue
  -> shared lighting and presentation
```

## Workflow

1. Define a shared weather state for coverage, wind, density, speed, and progress.
2. Drive falling precipitation and surface effects from that same state.
3. Use world- or object-space masks for accumulation, wetness, puddles, or caps.
4. Filter snow caps by upward-facing orientation and splashes by visible upward receivers.
5. Couple wetness to color, roughness, puddle mask, and ripple normals.
6. Pool and wrap precipitation around the active camera or bounded weather volume.
7. Expose mask, normal, particle, splash, and weather-progress diagnostics.

## Rules

- Preserve third-party license boundaries before copying any reference code, shaders, textures, or flipbooks. Exclude GPL-derived implementation from proprietary or differently licensed work unless its obligations are accepted explicitly.
- Keep all weather inputs deterministic for captures and regression evidence.
- Tune particles only after the affected surfaces read correctly.

## Reject

- Rain or snow ignores the wind or timing used by the surface response.
- Wetness only changes roughness with no coverage, normal, or material cause.
- Snow adheres uniformly to vertical faces.
- Splashes occur on hidden or downward-facing surfaces.
