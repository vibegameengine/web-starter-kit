# Round 2 Validation Renders — Sword Scene: Failure Modes → Final

Seven renders documenting the full investigation arc from "recipes verbatim" through every recipe gap surfaced and patched. Each iteration is the raw output Blender produced — none are cherry-picked.

## The investigation arc

| File | Recipe state | Outcome | What it revealed |
|------|-------------|---------|------------------|
| `M_sword_attempt1_broken_world.webp` | Recipes verbatim | Magenta floods scene | World tree leftover from earlier C2 HDRI test; Environment Texture had `image=None` |
| `M_sword_attempt2_clean_world.webp` | After manual world reset | Sword mostly in shadow | Lights at fixed coords with hardcoded rotations; no subject-aware aim |
| `M_sword_attempt3_aimed_lights.webp` | + aimed lights + reframed | Parts visible but blade clips top | Camera lacks bbox-aware framing |
| `M_sword_attempt4_correct_dimensions_wrong_orientation.webp` | + proper sword dimensions (78×4.5×0.8cm) | Looks like a "thin pole" | Camera viewing edge of blade (0.8cm thick), not broad face (4.5cm) |
| `M_sword_attempt5_rotated_no_taper.webp` | + Z-rotated 90° to face broad side | Visible blade but blunt tip | Top vertices scaled to 30%/50% leaves a chiseled flat |
| `M_sword_attempt6_with_pointed_tip.webp` | + merged top vertices to a point | Recognizable sword | Working — needed proper merge after collapse |
| **`M_sword_FINAL_v0.6.0.webp`** | All v0.6.0 patches applied; built fresh | Credible sword | Final result with all patches integrated |

## Six patches that came out of this

1. **`reset_world()` helper in orchestrator** — prevents broken Environment Texture state from corrupting renders
2. **`references/common-object-dimensions.md`** — real-world reference proportions (sword: 78×4.5×0.8cm blade, not "guess")
3. **`aim_at(light, target)` helper in `blender-lighting`** + Recipe 0 (subject-aware three-point)
4. **Bbox-aware camera framing** in `blender-cameras` Recipe 0 — fits subject to ~80% of vertical frame at the chosen focal length
5. **Axis-orientation guidance** in `blender-modeling` for elongated objects (broad face vs thin edge; rotate so broad axis faces camera)
6. **Proper tapering recipe** in `blender-modeling` — collapse top verts AND `remove_doubles` (without merge, the four collapsed verts stay distinct → degenerate "fake point")

## Meta-lesson committed to the orchestrator

The orchestrator's workflow now includes a **mandatory visual validation checkpoint** between rendering and reporting success. Numerical checks (object count, file size, no API errors) passed on every iteration above — but iterations 1, 2, 3, 4, 5 all looked broken. The user catching this is what drove the patches. The orchestrator must look at the picture before declaring done.

See `test_round2.md` at repo root for the full investigation, root causes, and patches.
