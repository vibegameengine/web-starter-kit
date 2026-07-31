---
name: threejs-image-pipeline
description: Design an explicit HDR image pipeline for Three.js scenes. Use when combining ambient occlusion, atmosphere, transparency, bloom, exposure, tone mapping, grading, render targets, or multiple post-processing passes.
---

# Three.js Image Pipeline

Use this skill only when effects share buffers, ordering, or color-space ownership. For a single isolated effect, keep the effect local.

## Establish ownership

Write down which system owns HDR scene color, depth, normals, motion, exposure, tone mapping, grading, UI composition, and final output conversion. Provide a toggle and an effect-only diagnostic for every nontrivial pass.

## Order

```text
HDR scene color + depth/normals
  -> lighting-related screen effects
  -> atmosphere and transparency composition
  -> bloom
  -> exposure
  -> tone mapping
  -> creative grade
  -> presentation effects
  -> output conversion
```

## Rules

- Tone-map and convert output color space exactly once.
- Extract bloom from HDR values before tone mapping.
- Meter exposure from a dedicated luminance signal, not an 8-bit final frame.
- Upsample low-resolution effects with depth- and normal-aware weights where needed.
- Protect UI explicitly when it shares a target with presentation effects.
- Build pass toggles before tuning the composite.

## Acceptance

Capture the final frame, no-post baseline, and each effect contribution. Check a dark frame, a bright frame, transparent materials, emissive VFX, and UI readability. Record render-target sizes and frame-time cost.

## Reject

- Multiple systems own tone mapping or output encoding.
- Bloom is tuned after display clamping.
- An effect is approved only in the full composite because its contribution cannot be inspected.
