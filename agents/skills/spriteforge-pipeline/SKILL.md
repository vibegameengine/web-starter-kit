---
name: spriteforge-pipeline
description: Use SpriteForge to import, key, clean, outline, slice, or export 2D game sprites and UI atlases. Trigger when a user mentions SpriteForge, `__AGENT_API__`, chroma key/keying, pink/green background removal, sprite cleanup, outline nodes, or wants a processed SpriteForge result saved next to its source asset.
---

# SpriteForge pipeline

Use the hosted editor at `https://vibegameengine.github.io/spriteforge/app/` through the `playwright` skill. Run it headed; inspect the visible result before calling it clean.

## Start and inspect

1. Open the editor with Playwright using `--headed`, then take a fresh snapshot.
2. Use the app's `window.__AGENT_API__`; first inspect `Object.keys(window.__AGENT_API__)` and the needed namespace. Do not search the application's source or replace the editor with shell image processing.
3. Upload the source PNG through the editor's file chooser. Let SpriteForge build its source, chroma, grid, timeline, and output nodes.
4. Inspect `nodes.list()` and `nodes.connections()` before rewiring anything.

## Key a solid-color background

1. Determine the exact background key color from the source or its supplied convention. For the project pink atlas, use `#f825cb` unless the user has changed it.
2. Update the `chroma` node through `__AGENT_API__.nodes.updateData(id, data)`. Enable its color-removal mode and tune only the requested fields (`keyColor`, `similarity`, `smoothness`, cleanup, or spill).
3. Capture a headed screenshot on the transparency checkerboard. Look for remaining key-color halos and unintended damage to colored ornament details.
4. Preserve the user's manual settings. Never silently enable, disable, or retune a node they intentionally changed.

## Add or rewire a node

1. Add with `__AGENT_API__.nodes.addNode(type, x, y, data)` and inspect the created node before setting its data.
2. Rewire sequentially: remove the old connection, wait for state to settle, then add each connection with `nodes.addConnection(source, target)`. Verify the final graph with `nodes.connections()`.
3. For a dark one-pixel anti-halo outline, place `Outline` after Chroma Key and before Slice Grid. Use the requested dark color and `thickness: 1`; leave it bypassed when the user asks to keep it disabled.
4. Do not assume numeric enum values. Read the node's visible setting after updating it and correct only if the UI shows a different value.

## Export

1. Export from the `Output` node using its **Download Frame Image** button; do not export a screenshot.
2. Save the downloaded PNG immediately beside the source file, not only in Playwright's temporary download directory. For example, place the keyed variant of `concepts/skill-tree/skill-atlas-pink.png` at `concepts/skill-tree/skill-atlas-keyed.png`.
3. Keep the source untouched. Confirm the resulting PNG has alpha and report its project-local path.

## Guardrails

- Use the editor and its API as the source of truth; use shell tools only to inspect the final downloaded file or move it to the requested project location.
- Take a fresh snapshot before every UI reference. Use API calls only where a UI action is unavailable or unreliable.
- Do not create a manifest, slice assets, or change application code unless the user explicitly asks for that next step.
