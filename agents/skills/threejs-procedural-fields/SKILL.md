---
name: threejs-procedural-fields
description: Design coherent, inspectable scalar and vector fields for Three.js materials, geometry, terrain, biomes, wetness, displacement, and VFX. Use when several visual channels must share a physical or artistic cause instead of stacking unrelated noise.
---

# Three.js Procedural Fields

Start with the causes that define the subject. Treat noise as one possible input, not the design.

## Field contract

Write the field bundle before shader code:

```text
stable coordinates
  -> macro form
  -> named structural fields
  -> derived causes
  -> material, geometry, or VFX channels
```

For example, derive a moisture mask from height, cavities, exposure, and a weather parameter; reuse it for albedo darkening, roughness, puddle coverage, and normal response.

## Workflow

1. Choose object-, world-, UV-, or direction-space coordinates that remain stable under the intended transforms.
2. Declare perceptual scale for macro form, regions, breakup, and microdetail.
3. Name every primary field and expose it in a diagnostic mode.
4. Derive secondary fields from causes such as slope, height, curvature, distance, exposure, and flow.
5. Reuse fields across every channel they physically affect.
6. Filter details below represented mesh density or a screen pixel.
7. Verify the final result, each field, and the no-post baseline at intended viewing distances.

## Rules

- Warp coordinates, not independently computed outputs.
- Keep categorical masks broad and readable; avoid isolated threshold bubbles.
- Derive displacement and shading normals from compatible height information.
- Name controls by perception, such as `ridgeWidth`, `wetnessCoverage`, or `cavityDarkening`.
- Make stochastic inputs deterministic whenever they affect acceptance or regression evidence.

## Reject

- Independent noise drives color, roughness, normals, and emission with no shared structure.
- Detail aliases or shimmers at the design camera distance.
- A material can be tuned only from its final beauty frame because masks are hidden.
