---
name: visual-verification-gate
description: Define and execute visual acceptance before, during, and after any task that can change rendered UI, game scenes, 3D assets, animation, responsive layout, or browser behavior. Use before editing a visual surface, for redesigns that must be proven in an isolated lab before integration, after visual feedback, and before claiming a visual result complete.
---

# Visual Verification Gate

Treat visual verification as part of implementation, not as a final optional check. Define the evidence and pass criteria before changing files, prove redesigns in isolation, then repeat the proof in the integrated product.

## Non-negotiable rules

- Write a visual test contract before the first edit.
- Never use headless browsers, software GL, SwiftShader, or an HTTP response as visual evidence.
- Never claim visual success from `build`, typecheck, lint, tests, DOM inspection, or console output alone.
- Never claim a screenshot was checked until it was opened and visually inspected.
- Never skip visual verification because a preferred tool is absent. Discover available direct MCP/browser tools, then fall back to headed Playwright.
- Use the already-running dev server. Never start, stop, kill, or restart it; rely on HMR.
- Save temporary reviewable evidence under the local Git-ignored
  `wip/<task-slug>/`; never commit captures or place them under `docs/` unless
  the user explicitly asks for a durable documentation artifact.
- Block integration until the isolated visual gate passes.
- Re-run the visual gate after every fix that changes the rendered result.

## 1. Write the visual test contract

Before editing, state this contract in the working plan or commentary:

```text
Visual test contract
- Surface: route, lab, component, scene, asset, or animation being changed
- Baseline/reference: current frame, supplied design, screenshot, or explicit invariant
- Isolated proof: DEV lab/authoring scene and states to inspect
- Integrated proof: real route/scene and surrounding systems to inspect
- Coverage: viewports, camera views, interaction states, content extremes, and motion samples
- Tool path: direct MCP/browser tool; headed Playwright fallback
- Evidence: local `wip/<task-slug>/` paths for baseline, isolated, and integrated captures
- Pass criteria: concrete visual properties that must be true
```

Do not use “looks good” as a criterion. Name observable properties: alignment, hierarchy, silhouette, spacing, cropping, contrast, occlusion, state feedback, responsive behavior, animation continuity, or reference drift.

Mark visual verification `N/A` only when the scoped task cannot alter any rendered surface or visual artifact. Tool unavailability is never a valid `N/A` reason. When uncertain, treat the task as visual.

## 2. Resolve the verification tool path

Use this order:

1. Inspect the tools already available in the current session.
2. Use `tool_search` to discover deferred app-specific, Browser, Chrome, Figma, Blender, or other relevant MCP tools.
3. Prefer the direct MCP that can show the real target surface and capture its state.
4. For a web runtime, use the connected headed Browser/Chrome workflow when available.
5. If direct browser MCP access is unavailable or unsuitable, use Playwright with `headless: false` against the existing dev server.
6. Prefer repository-defined headed harnesses under `scripts/` or `package.json`; do not run an ad-hoc headless or software-rendered substitute.

Do not answer “visual verification is impossible because no tool is available.” Continue down the ladder. If authentication or another external dependency blocks one path, try the next in-scope path and report only the concrete remaining blocker after exhausting the ladder.

## 3. Capture the baseline

- Open the current target in a headed, GPU-backed surface.
- Reproduce the exact state that the change will affect.
- Capture the current frame before editing.
- Open and inspect the capture; record existing defects separately from the requested change.
- If a reference exists, establish the same crop, viewport, camera, state, and lighting before comparing.

The baseline prevents accidental regressions and makes before/after evidence meaningful.

## 4. Prove the change in isolation

For a redesign or new visual element:

1. Use an existing DEV-only lab or authoring scene.
2. If none exists, create the smallest production-representative DEV-only lab before integrating the feature.
3. Render real components, assets, fonts, materials, effects, and state logic; do not approve a disconnected mock.
4. Exercise all relevant states and boundary content.
5. Capture and inspect each required viewport/camera/state.
6. Fix failures in the lab and repeat the capture.
7. Integrate only after every isolated hard gate passes.

For 3D scenes, use the dedicated DEV authoring camera and inspect headed front, side, and back views before mounting the unchanged player. Never alter player scale, entity root scale, or the shared camera to make the composition pass. During authored placement work, inspect a new headed frame after each placement step.

For motion, inspect representative key frames plus the transition in real time. A still frame alone cannot approve timing, easing, flicker, popping, or continuity.

## 5. Run the isolated gate

Require all applicable checks:

- Composition and hierarchy match the stated intent.
- Alignment, spacing, sizing, and typography are stable.
- Colors, contrast, materials, lighting, and effects are intentional.
- No clipping, overflow, texture stretch, missing asset, z-fighting, or occlusion defect is visible.
- Default, hover, focus, pressed, selected, disabled, loading, empty, error, and overflow states are checked when applicable.
- Smallest supported, representative, and largest supported viewports are checked.
- Long text, localization, extreme values, and safe-area constraints are checked when applicable.
- Motion has no flicker, pop, discontinuity, or unintended layout shift.
- The inspected screenshot or frame is saved inside the repository.

Any failed hard gate returns the task to the isolated lab. Change one visual cause at a time, capture again, and keep the failed evidence available for comparison unless the user authorizes deletion.

## 6. Integrate and verify in context

After isolated acceptance:

1. Mount the accepted result in the real route or scene without changing the accepted contract.
2. Reproduce the same states, viewports, cameras, and interactions.
3. Check surrounding layout, world composition, z-order, occlusion, input hit areas, transitions, and neighboring features.
4. Confirm real data, localization, assets, lighting, camera, player, and responsive containers do not change the result unexpectedly.
5. Check adjacent states likely to regress.
6. Capture and inspect integrated evidence.

An isolated pass is not an integrated pass. Both are required for a redesign.

## 7. Close the verification loop

Report visual acceptance only when the evidence supports it. The handoff must include:

- the isolated lab/route and integrated route that were inspected;
- the headed tool path used;
- viewports, camera views, states, and interactions covered;
- local `wip/<task-slug>/` paths to baseline, isolated, and integrated evidence;
- pass/fail status against the original criteria;
- any remaining visual risk or exact blocker.

Use “compiled but not visually verified” when only static checks ran. Use “visually verified” only after inspecting headed evidence from the real rendered surface.

## Checklists

### Before editing

- [ ] Visual test contract is written.
- [ ] Baseline/reference and concrete pass criteria are fixed.
- [ ] Isolated and integrated verification surfaces are identified.
- [ ] Relevant states, viewports, cameras, content extremes, and motion samples are listed.
- [ ] Direct MCP/browser tools were inspected or discovered with `tool_search`.
- [ ] Headed Playwright fallback is ready.
- [ ] Existing dev server will be reused.
- [ ] Evidence directory inside the repository is selected.

### Isolated acceptance

- [ ] Real production component/assets are rendered in a DEV lab or authoring scene.
- [ ] Baseline and reference conditions are reproducible.
- [ ] All applicable visual and interaction states were exercised.
- [ ] Responsive boundaries or required camera views were inspected.
- [ ] Motion was watched in real time when applicable.
- [ ] Captures were opened and visually inspected.
- [ ] All hard gates pass before integration.

### Integrated acceptance

- [ ] The accepted isolated result is mounted in the real route/scene.
- [ ] The same coverage was repeated in context.
- [ ] Neighboring layout, systems, input, camera, lighting, and occlusion were checked.
- [ ] No player, shared-camera, or root-scale shortcut was used.
- [ ] Adjacent regression states were inspected.
- [ ] Integrated captures were opened and visually inspected.

### Final handoff

- [ ] Baseline, isolated, and integrated evidence lives in local `wip/<task-slug>/`.
- [ ] Evidence paths, tool path, states, and viewports are reported.
- [ ] Visual pass/fail is stated against the original contract.
- [ ] Static validation is reported separately from visual validation.
- [ ] No known visual failure from the current work remains unresolved.
