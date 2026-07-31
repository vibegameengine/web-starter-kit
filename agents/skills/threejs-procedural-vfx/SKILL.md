---
name: threejs-procedural-vfx
description: Build readable, event-driven realtime VFX in Three.js. Use for impacts, trails, sparks, plasma, dissolves, wakes, anomaly effects, or debris that need explicit event state, pooled lifetime ownership, coherent motion, and HDR-aware shading.
---

# Three.js Event VFX

Build each effect as a causal graph, not a pile of unrelated emitters.

## Effect contract

```text
event state
  -> geometry or instance attributes
  -> shared motion field and age
  -> material response
  -> pool and lifetime ownership
  -> HDR contribution
```

## Workflow

1. Define the triggering event, local frame, duration, and terminal state.
2. Give each layer one role: silhouette, motion, illumination, or residue.
3. Derive secondary movement from the same direction, flow, or event envelope.
4. Use normalized lifetime curves instead of scattered timing constants.
5. Pool particles, trails, and debris; release and reset them deterministically.
6. Set HDR emission before bloom and keep a no-bloom baseline readable.
7. Inspect spawn bounds, overdraw, active instances, luminance, and final output.

## Rules

- Clamp integration delta and reset state on replay or disposal.
- Keep shake bounded and separate from the physical trajectory.
- Use a seeded source whenever variation is part of repeatable validation.
- Choose representation intentionally: mesh, instanced geometry, ribbon, screen-space pass, or texture flipbook.

## Reject

- New allocations occur for every burst.
- A layer has no distinct visual role.
- Bloom supplies the effect's only visible form.
- Motion, lifetime, and color changes use unrelated time functions.
