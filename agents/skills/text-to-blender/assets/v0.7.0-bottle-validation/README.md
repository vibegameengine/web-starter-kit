# v0.7.0 Validation Renders — Wine Bottle (Surface Revolution)

This round tested whether the v0.6.0 patches generalise beyond the sword scene. **They do.**

The bottle uses an entirely different modeling pattern (Surface Revolution via Screw modifier) and an entirely different material class (transmissive glass) than the sword (primitives + metallic). All v0.6.0 patches applied without modification: world reset, real-world dimensions lookup, subject-aware lighting, bbox-aware camera, mandatory visual checkpoint.

| File | What it shows | Notable |
|------|---------------|---------|
| `bottle_first_try.webp` | Recipes verbatim, glass with surface tint only | Recognizable bottle shape but glass looks **metallic** — surface-tint approach produces flat colour |
| `bottle_FINAL_v0.7.0.webp` | After Volume Absorption patch | Proper depth-based tint; thick parts darker, thin parts lighter — reads as wine-bottle glass |

## What this round contributed to the skill

**Recipe 6b (Coloured glass with Volume Absorption)** added to `blender-materials/SKILL.md`.

The existing Recipe 5/6 (clear/frosted glass) only configured Principled BSDF surface inputs. For *coloured* glass, that produces flat-tinted or mirror-metallic results. The proper technique is to attach a `Volume Absorption` shader to the Material Output's Volume input — then light passing through the glass gets tinted by the distance it travels, giving the depth-based richness that makes glass read as glass.

Other findings:
- `Roughness=0.0` on glass surface produces mirror highlights that read as polished metal. Use `0.02–0.05` instead.
- `Cycles transmission_bounces` default 12 can produce black-on-inside artifacts; `24` is safer for thick or layered glass.

## Known limitation deferred to next round

When the rim light is strong enough to make the bottle silhouette readable against a dark backdrop, it overpowers the volume colour and the green tint washes out. Future lighting-optimization round should:
- Add HDRI options for glass scenes (volumetric reflections enrich the colour without needing a strong rim)
- Provide subject-class hints to the lighting recipe ("glass" → softer rim, more fill)

## Validation note

No manual fixes were needed beyond the volume-absorption recipe addition. Compared to round 2's sword (5+ user-driven iterations), this is a clean v0.7.0 — the v0.6.0 patches are doing real work.
