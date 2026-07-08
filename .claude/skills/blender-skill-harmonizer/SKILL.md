---
name: blender-skill-harmonizer
description: Harmonize multiple Blender skills into a coherent pipeline with clear activation precedence, handoff artifacts, dependency gates, and conflict-resolution rules. Use when a Blender task spans several skills, when reference-locked work conflicts with generic production workflow, after adding/updating skills, or when repeated failures indicate skill interference or missing inter/intra-play.
when_to_use: Multi-skill Blender orchestration, skill graph audits, resolving overlaps between text-to-blender/pro-workflow/reference-to-3d/wireframe/UV/fit/repair skills, defining source-of-truth precedence, artifact contracts, and sequential-vs-parallel execution plans.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Blender Skill Harmonizer

This is the meta-layer for the Blender skill stack. It prevents independently useful skills from producing incoherent work when combined.

Use a **Merge → Consistency → Optimize → Store** cycle:

1. **Merge:** list all triggered skills and their intended outputs.
2. **Consistency:** detect conflicts in assumptions, coordinate systems, source hierarchy, object naming, or validation gates.
3. **Optimize:** choose one orchestrator, one source-of-truth policy, and a staged/parallel execution plan.
4. **Store:** write the chosen plan and durable lessons into project docs/memory.

## Skill category map

- **Top-level orchestrators:** `text-to-blender`, `quality-refinement-autoloop`, `mascot-logo-reconstruction`.
- **General production:** `blender-pro-workflow`, `blender-modeling`, `blender-materials`, `blender-lighting`, `blender-cameras`, `blender-rendering`, `blender-animation`, `blender-export`.
- **Reference reconstruction:** `reference-to-3d`, `wireframe-to-3d`, `reference-analysis-validator`, `source-part-segmentation`, `orthographic-registration`, `multiview-constraint-solver`, `contour-to-mesh`, `texture-driven-mesh-fitting`, `landmark-fit-repair`, `multiview-fit-loop`, `fit-repair-optimizer`.
- **Texture/UV:** `blender-uv-texturing`, `atlas-uv-fitting`, `closed-surface-uv-coverage`.
- **Look calibration:** `reference-look-calibration`.
- **Animation/motion design:** `texture-state-animation`, `orbital-hud-motion`, `animation-quality-gate`, coordinated by `blender-animation`.
- **Task-specific/full workflow:** `mascot-logo-reconstruction`.

## Activation precedence

For a task involving references/templates/textures:

1. `blender-skill-harmonizer` — choose the pipeline and conflict policy.
1a. `quality-refinement-autoloop` — if output is rejected/subpar, freeze product work, diagnose, sanitize/patch generic skill knowledge, validate, then retry.
2. `reference-analysis-validator` — source manifest and source-of-truth classification.
3. `orthographic-registration` — view consistency and coordinate contract.
4. `multiview-constraint-solver` — rigid feasibility and canonical view policy.
5. `fit-repair-optimizer` — dependency repair queue if validation fails.
6. `source-part-segmentation` — split overlapping structural/decorative masks.
7. `contour-to-mesh` / `wireframe-to-3d` / `blender-modeling` — geometry, selected by source type.
8. `texture-driven-mesh-fitting` + `landmark-fit-repair` — fit mesh boundaries and named landmarks to source/texture.
9. `atlas-uv-fitting` / `blender-uv-texturing` / `closed-surface-uv-coverage` — UV, texture fit, and full front/back/side surface coverage.
10. `multiview-fit-loop` — render/compare/adjust loop.
11. `reference-look-calibration` + `blender-materials` / `blender-lighting` / `blender-rendering` — look only after geometry/UV gates.
12. `blender-export` — only after validation gates.
13. `blender-animation` — only after static fit acceptance.
14. `texture-state-animation` / `orbital-hud-motion` — design texture/HUD motion as layered, source-derived animation.
15. `animation-quality-gate` — render contact sheet and reject bad motion before final export.

Generic `blender-pro-workflow` is subordinate to the reference-locked order whenever the source is a template/brand asset.

## Shared artifact contract

Every non-trivial multi-skill pipeline should keep these files in the output folder:

- `reference_manifest.json`
- `registration_report.json`
- `atlas_regions.json`
- `validation/multiview_fit_report.json`
- `validation/*_overlay.png`
- `ALIGNMENT_REPAIR_QUEUE.json` or equivalent when gates fail
- `BUILD_NOTES.md`

## Conflict rules

- **Source conflict beats implementation.** If templates disagree, stop claiming final fit and write a conflict report.
- **Front-view brand read beats side/back/top unless canonical policy says otherwise.**
- **Reference-locked geometry beats generic modeling.** Do not primitive-first rebuild after a contour/source mask exists.
- **UV/texture fit waits for geometry lock.** Texture audit may run in parallel, but final UV assignment waits.
- **Lighting/look waits for material and camera lock.** Do not tune lights to compensate for wrong geometry.
- **Export waits for validation.** No final GLB without pass/fail reports.

## Sequential vs parallel orchestration

Sequential gates:

1. source conflict / multiview rigidity
2. structural part count
3. front geometry
4. multiview geometry
5. UV/material texture fit
6. lighting/look
7. export/animation

Parallel lanes allowed after their blockers clear:

- atlas region classification can run while geometry is being repaired;
- lighting reference statistics can run while UVs are being prepared;
- export target checks can run while visual validation is pending;
- validation tooling improvements can run anytime, but must not mutate product geometry.

## Read when needed

- `references/handoff-contracts.md` for exact input/output contracts between skills.

## Script

- `scripts/skill_graph_audit.py` audits the local manifest, roles, missing paths, and overlap warnings.


## Animation handoff rule

For reference-locked mascots/logos, animation is not a generic spin/pulse task. Use `texture-state-animation` for material/texture state changes, `orbital-hud-motion` for circles/HUD/aura, and `animation-quality-gate` before accepting or exporting. If an animation is rejected as ugly, run a RALPH loop before rebuilding.

## Closed-surface coverage handoff rule

For closed or extruded reference-locked assets, front texture fit is not enough. Before look-dev or animation acceptance, run `closed-surface-uv-coverage` to verify that front cap, back cap, and sidewall surfaces each have explicit UV/generated/procedural coverage. Curves, planes, HUD, and aura elements are accents only and do not count as surface texture fill.

## Quality-refinement autoloop handoff rule

When a user rejects output quality, or repeated failures show missing skill depth, do not continue blind retries. Invoke `quality-refinement-autoloop`: preserve the baseline, capture evidence, classify failure dimension, decide whether existing skills are sufficient, sanitize any new lesson into generic skill guidance, validate the skill stack, then repair the artifact. Publication prep is only done on explicit user request.
