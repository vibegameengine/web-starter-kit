# v0.8.0 Validation Renders — Chair (Multi-Part Assembly + Wood Material)

This round tested whether the patches generalise to a third scene class: **multi-part assembly with non-vertical bbox + procedural wood**. They do — with one important caveat about design quality vs build correctness.

## The iteration arc

| File | What it shows | Lesson |
|------|---------------|--------|
| `chair_attempt1_simple_rectangles.webp` | 6 plain rectangles + subtle wood texture | User reaction: "very simple chair with a printed plastic wrap" — texture too subtle, shape too plain |
| `chair_attempt2_overcooked_wood.webp` | After ramping up bump strength + ColorRamp contrast + Voronoi knots | User reaction (anticipated): "looks like rough timber" — over-corrected from subtle to busy |
| `chair_attempt3_balanced_wood.webp` | Tuned bump down + smoother ColorRamp + fewer knots | Wood now reads as wood (per user: "looks more like wood"), but model still simple rectangles |
| **`chair_FINAL_v0.8.0.webp`** | Added structural details: stretchers, slatted back, top rail | Recognizable Mission/Shaker chair; user reaction: "looks better, but is still an ugly designed chair" |

## What this round contributed

1. **Updated `references/common-object-dimensions.md`** for the dining chair entry: now includes structural details (stretchers, slatted back, top rail) and shape refinements (leg taper, edge bevels) — not just bare dimensions. Future "build a chair" requests should default to this baseline rather than 6 plain rectangles.

2. **Wood material tuning lessons** documented inline:
   - Bump strength 0.20 (not 0.6 — overcooks; not 0.15 — undercooks)
   - ColorRamp contrast: 3 stops with smooth gradient (0.20→0.38→0.55 in normalized brightness)
   - Voronoi influence ≤ 0.10 in OVERLAY mix (any more = busy "knotty" look)
   - Wave Scale 12, Distortion 3 — clear bands without distortion soup
   - Per-part grain orientation is a known limitation (Wave bands_direction='X' produces vertical stripes on vertical panels — looks like paneling). Future "wood-material per-part-orientation" recipe round.

## Important honest limitation

**The orchestrator can produce *functionally correct* objects but not *well-designed* ones.** The user's "ugly designed chair" feedback is accurate — we crossed from "rectangle stack" to "functional Mission chair", but a genuinely beautiful chair needs:

- Curved back slats (S-curve following spine)
- Profile-cut or turned legs
- Contoured seat with rolled front edge
- Tapered top rail
- Considered proportions beyond just real-world dimensions

These are *aesthetic choices*, not build errors. They require either a curated library of chair-design recipes (Wishbone, Eames, Windsor, etc.), or a design-quality refinement pass driven by reference images, or accepting that automated generation produces functional objects and aesthetic refinement is a separate human-driven step.

This is a real boundary of what the skill can do automatically. We ship v0.8.0 with the limitation documented rather than pretending the chair is hero-quality.

## What WORKED well in this round (positive signal)

- Pipeline produced a recognizable chair on first try (just like the bottle)
- v0.6.0+v0.7.0 patches all applied cleanly: world reset, real-world dimensions, subject-aware lighting, bbox-aware camera, mandatory visual checkpoint
- The connection-overlap pattern from v0.6.0 worked across leg-seat, seat-back, leg-stretcher junctions
- Procedural wood material generalised (used same pattern as the v0.6.0 sword leather grip)
- Multi-iteration refinement was driven by user feedback at each step — exactly the loop the orchestrator's mandatory visual validation is designed to facilitate
