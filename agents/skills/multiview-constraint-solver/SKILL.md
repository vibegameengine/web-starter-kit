---
name: multiview-constraint-solver
description: Determine whether front/side/back/top reference templates can be satisfied by one rigid 3D Blender model, choose a canonical source policy, and emit constraints before rebuilding. Use when multiview bboxes, silhouettes, part counts, or depth ratios contradict each other.
when_to_use: Orthographic template conflict detection, canonical view policy, rigid-vs-cheat-view decision, front/side/top dimension ratios, source-of-truth negotiation before reconstruction.
allowed-tools: Read Bash Glob Grep
---

# Multiview Constraint Solver

Use this before another rebuild when references disagree. A renderer cannot make one rigid mesh satisfy mutually incompatible orthographic dimensions unless you allow view-specific cheats.

## Workflow

1. Normalize every reference view into a common axis contract:
   - front: width X, height Z;
   - side: depth Y, height Z;
   - top: width X, depth Y;
   - back: width X, height Z.
2. Measure visible body bboxes, not labels/background/aura unless they are part of the model contract.
3. Compare shared axes:
   - front width vs top width;
   - front/back height vs side height;
   - side depth vs top depth.
4. If ratios differ beyond tolerance, write a conflict report and select a policy:
   - `front_side_canonical`: front brand read and side depth/height are authoritative;
   - `front_top_canonical`: front brand read and top footprint are authoritative;
   - `corrected_templates_required`: no rigid rebuild should claim final fit;
   - `view_specific_cheats`: separate camera/view variants allowed, not one rigid asset.
5. Feed the chosen policy into `fit-repair-optimizer` before any geometry, UV, or lighting work.

## Hard gates

- Do not restart modeling until canonical policy exists.
- Do not treat top-view aura/context as body depth.
- Do not average contradictory dimensions unless the user explicitly asks for an approximate stylized compromise.
- Record part-count disagreements separately from bbox disagreements.

## Script

- `scripts/view_constraint_report.py` reads a JSON file of per-view body bboxes and emits shared-axis compatibility and a suggested canonical policy.
