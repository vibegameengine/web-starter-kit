---
name: threejs-water-optics
description: Build bounded or analytic water surfaces in Three.js with shared waves, normals, reflection, refraction, absorption, foam, caustics, and interaction ripples. Use for pools, puddles, shore water, canals, and other non-spectral water.
---

# Three.js Water Optics

Treat water as coupled geometry motion, surface orientation, and optical response. A transparent blue material is not a water system.

## Build order

1. Define the bounds, wave bands, and coordinate space.
2. Evaluate displacement and derive normals from the same wave function.
3. Declare whether refraction has scene-color/depth support or a stated fallback.
4. Blend reflection and refraction with view-angle-dependent Fresnel response.
5. Use depth or an explicit path-length estimate for absorption.
6. Derive foam, glints, caustics, and ripples from the same wave or interaction state.
7. Filter unresolved normal bands and validate from above, at grazing angles, and through the water.

## Rules

- Keep an analytic normal-only surface visibly distinct from displaced geometry.
- State the limitations of screen-space refraction and fallback depth estimates.
- Make local interaction ripples bounded, pooled, and coupled to the surface normal.
- Render and tune water in the HDR pipeline before final bloom and grading.

## Reject

- Scrolling normals disagree with visible displaced crests.
- Foam is a detached scrolling texture.
- Constant opacity replaces Fresnel and absorption.
- Reflection, refraction, and transparency are combined without energy control.
