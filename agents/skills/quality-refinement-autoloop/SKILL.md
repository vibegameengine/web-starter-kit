---
name: quality-refinement-autoloop
description: Run a self-refinement loop when a Blender result is subpar, user expectations are not met, validation fails, or repeated issues reveal missing skill depth. The loop diagnoses the gap, decides whether to repair the artifact or acquire/refine a generic skill, sanitizes lessons for reusable publication, updates docs/versioning, validates, and prepares stage/commit/push when explicitly requested.
when_to_use: Subpar output, user rejects quality, repeated Blender failure, RALPH loop, skill gap diagnosis, autonomous skill refinement, sanitized skill contribution, release prep, docs/version bump, staged commit and push workflow.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Quality Refinement Autoloop

Use this when the user says the result is wrong, ugly, not aligned, not textured, not animated, not exportable, or otherwise below expectation. The goal is not to keep tweaking blindly. The goal is to convert failure into a reusable, generic skill improvement before trying again.

## Autoloop phases

### 0. Freeze and preserve

- Stop making product changes immediately.
- Preserve the last accepted baseline and the failed artifact.
- Name the failed branch/version honestly; do not overwrite accepted outputs.

### 1. Evidence capture

Collect the smallest evidence set that proves the failure:

- user feedback quote or summary;
- source/reference files used;
- current output path/version;
- relevant render/contact sheet/overlay/audit report;
- scene/material/object inventory if the failure is inside Blender.

### 2. Diagnose failure dimension

Classify the primary gap:

- geometry / silhouette / landmarks;
- multiview/depth consistency;
- UV / atlas / texture fit;
- closed surface coverage (front/back/side);
- look/material/lighting calibration;
- animation/motion/export truth;
- orchestration/handoff between skills;
- missing validator or missing deterministic helper script.

### 3. Skill-gap decision

Ask: does the current skill stack already contain a generic method for this failure?

- If yes: run the existing skill and repair the artifact.
- If no: add/refine a generic skill first, then repair.
- If repeated failures come from skill interplay, update the harmonizer/handoff rule, not just a leaf skill.

### 4. Sanitize the lesson

Before writing a skill change:

- remove project/client/asset names;
- remove secrets, raw logs, private paths, personal data, and copyrighted source content;
- keep only reusable method, gates, scripts, and failure patterns;
- describe inputs/outputs generically;
- prefer deterministic scripts for fragile audits.

### 5. Patch skill stack

Apply the smallest publishable change:

- one concise skill or one concise section in an existing skill;
- optional helper script if the validation is repeatable;
- harmonizer update if ordering/handoff changed;
- manifest entry/version update.

### 6. Validate skill change

Required checks:

- scripts compile;
- manifest paths exist;
- skill graph audit passes with harmonizer present;
- sanitizer scan passes for project-specific terms;
- if applicable, run the new helper against the failed artifact and save a report.

### 7. Repair product only after skill gate

Rebuild or repair from the correct baseline using the improved skill. Do not reuse rejected outputs unless explicitly marked as source evidence.

### 8. Release prep when requested

Only when the user asks to publish/commit/push:

1. fetch latest remote and confirm local branch is up to date;
2. resolve/harmonize conflicts before staging;
3. bump version using semver appropriate to scope;
4. update README / plugin README / CHANGELOG / VERSIONING when relevant;
5. run sanitizer and compile/audit checks;
6. stage, commit, and push using the configured remote.

## Hard rules

- Do not bake task-specific examples into public skills.
- Do not call overlay curves/planes “texture coverage” unless the real mesh surface also passes coverage gates.
- Do not tune lighting/materials to hide geometry or UV failures.
- Do not claim export support if the effect exists only in Blender Python or a render sequence.
- Do not push without an explicit user request and an up-to-date remote check.

## Recommended artifacts

Save these near the project output when running the loop:

- `RALPH_OR_QUALITY_LOOP_REPORT.md`
- `failure_evidence/` or references to existing renders/reports
- `skill_gap_decision.json`
- `sanitization_report.json`
- `validation_report.json`

## Scripts

- `scripts/ralph_autoloop_plan.py` creates a generic failure-classification and loop plan from feedback/artifact hints.
- `scripts/sanitize_skill_contributions.py` scans skill files for project-specific or private terms before publication.
- `scripts/release_readiness_check.py` performs lightweight manifest/docs/version/path checks before commit/push.
