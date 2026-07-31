---
name: threejs-procedural-materials
description: Build coherent texture-backed PBR materials in Three.js. Use for terrain, props, wear, moss, wetness, emissive surfaces, or any material whose color, roughness, normals, and lighting must describe one shared surface identity.
---

# Three.js Procedural Materials

Make every PBR channel describe the same surface and the causes acting on it.

## Build order

```text
stable coordinates
  -> shared structural fields
  -> material identity weights
  -> causal modifiers
  -> filtered microstructure
  -> PBR channels
```

## Workflow

1. State the surface identity and its physical or stylistic causes.
2. Set real or perceptual texture scale and inspect it at design distance.
3. Build identity weights before adding microdetail.
4. Drive albedo, roughness, normal, displacement, and emission from compatible shared fields.
5. Filter normals and detail by derivatives, distance, or represented mesh density.
6. Add specular antialiasing when high-frequency normals make highlights unstable.
7. Expose channel, mask, roughness, normal, and emissive diagnostics.

## Rules

- Use texture-backed detail when it is part of the intended material identity; do not claim it is fully procedural.
- Let wetness darken color, change roughness, and alter normal or puddle response through one coverage cause.
- Keep triplanar or atlas projection seams, padding, and mip behavior observable before approving the beauty frame.
- Make emissive shape legible before bloom.
- Keep custom lighting energy-aware unless the visual contract explicitly calls for stylization.

## Reject

- Independent noise samples drive unrelated PBR channels.
- Roughness is an afterthought scalar.
- Micro-normal detail sparkles below a pixel.
- Post-processing hides unstable highlights or missing surface structure.
