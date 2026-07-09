---
name: text-to-blender
description: Drive Blender from natural language. Converts plain-English requests ("model a sword and render it with cinematic lighting", "make this glass look frosted", "set up three-point lighting", "export this scene as glTF for the web") into Blender Python code executed via the Blender MCP server. Acts as the orchestrator that picks and chain-loads specialised sub-skills (blender-modeling, blender-materials, blender-lighting, blender-cameras, blender-rendering, blender-animation, blender-export, wireframe-to-3d, blender-pro-workflow, blender-skill-harmonizer, quality-refinement-autoloop). Use this skill whenever the user wants Claude to do anything in Blender, including creating geometry, applying materials, lighting a scene, framing a camera, rendering, animating, or exporting. Make sure to invoke this skill even if the user does not say "Blender" — also covers requests like "create a 3D model of...", "render this...", "make a glTF from...", "set up a scene with...", or any 3D-creation task. Requires the Blender MCP addon (ahujasid/blender-mcp) running on port 9876.
when_to_use: User asks for any 3D creation, modification, lighting, rendering, animation, or export task. Anything involving Blender or that should reasonably be done in Blender.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info mcp__blender__get_viewport_screenshot
---

# Text-to-Blender Orchestrator

Turn plain-English requests into Blender work. You are the conductor: read the request, decide which sub-skills to chain-load, sequence them in the right order, and execute via the Blender MCP.

## Multi-skill harmonization

For complex tasks that trigger multiple Blender skills, especially reference/template/brand work, load `blender-skill-harmonizer` before choosing the execution order. It owns precedence, handoff artifacts, and conflict policy.

If the user rejects an output as sub-par, says the same issue is recurring, or asks to improve the skill stack before retrying, load `quality-refinement-autoloop` before further product work. It turns evidence into a sanitized reusable lesson, patches generic skills/docs/versioning when explicitly requested, and only then resumes the Blender repair loop.

## How this skill works

The user speaks in tasks ("render a hero shot of a sword on a stone"); you:

1. **Identify intent** → which capabilities are needed (modeling? materials? lighting? rendering? export?).
2. **Check prerequisites** → MCP server reachable, scene state.
3. **Reset world** to a known-good baseline (see *World reset* below) — prevents leftover broken HDRI / Environment Texture nodes from previous runs corrupting the render.
4. **Look up real-world dimensions** for the subject (`references/common-object-dimensions.md`) BEFORE generating Python. A "sword" has specific proportions; a "chair" has specific proportions; do not guess.
5. **Route to sub-skills** → load the relevant ones via `Read` and follow their instructions.
6. **Sequence** the work in the order pros use (see `references/assembly-order.md`).
7. **Execute** generated Python via `mcp__blender__execute_blender_code`.
8. **Validate** with `mcp__blender__get_scene_info`, `get_object_info`, AND **`get_viewport_screenshot`** — see *Visual validation checkpoint* below. Numerical validation alone is not enough: the API can report success while geometry is grossly wrong.
9. **Iterate** — if the visual check shows an obvious problem (subject barely visible, wrong proportions, wrong orientation), fix and re-render BEFORE reporting success.
10. **Report** to the user with concrete numbers AND a path to the proof render they can inspect.

### World reset (always step 3, before any composition)

Previous tests can leave the scene's world in a broken state — particularly an `Environment Texture` node with `image=None` cascading into Background, which produces a magenta-flooded render. Reset world to a neutral baseline at the start of every scene-build:

```python
def reset_world(scene, color=(0.04, 0.04, 0.05, 1.0), strength=0.4):
    world = scene.world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    for n in list(nodes):
        nodes.remove(n)
    output = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = color
    bg.inputs['Strength'].default_value = strength
    world.node_tree.links.new(bg.outputs['Background'], output.inputs['Surface'])
```

If the user wants HDRI lighting, override this AFTER it runs (load the actual `.hdr` file and verify `env.image is not None`).

### Visual validation checkpoint (always between steps 8 and 10)

After rendering, **always**:

1. Call `mcp__blender__get_viewport_screenshot` (or read the rendered file with `Read`).
2. Visually verify against the user's request. Specifically:
   - Subject is visible and recognisable (not a thin streak, not magenta-flooded, not entirely in shadow)
   - Proportions match the real-world reference dimensions for that subject
   - Composition is reasonable (subject in frame, not clipped at edges, not microscopic in one corner)
   - Materials have visible variation (not perfectly flat plastic-looking surfaces) — for production-quality scenes, add procedural texture nodes
3. **If the render is obviously wrong**, do NOT report success. Iterate: identify the specific problem, fix it, re-render, re-check.

A render passing every numerical check (object count, vertex count, file size, no error messages) can still look completely wrong. The user only sees the picture. Make sure the picture matches the request before declaring done.

### Set viewport to Material Preview mode (last step before reporting)

The user is often looking at Blender's viewport, not the rendered file. Blender defaults the viewport to **Solid** shading mode which ignores all materials and shows everything as flat grey. After scene assembly, switch the viewport to Material Preview so the user actually sees the materials they got:

```python
import bpy

for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        for space in area.spaces:
            if space.type == 'VIEW_3D':
                space.shading.type = 'MATERIAL'           # or 'RENDERED' for full quality
                space.shading.use_scene_lights = True
                space.shading.use_scene_world = True
```

Skip this only when the user has explicitly asked you to leave the viewport alone.

### Real-world dimension lookup

Before sizing any subject from natural language, consult `references/common-object-dimensions.md`. It lists realistic proportions for common requests:

| Subject | Total | Notes |
|---------|-------|-------|
| One-handed sword | ~95-100 cm long | Blade 78cm × 4.5cm × 0.8cm; guard 20cm × 2.5cm; grip 13cm; pommel 5.6cm |
| Chair | seat ~45cm × 45cm × 4cm | Seat height 45cm; back ~45cm tall |
| Bottle | 25-30cm tall | Body ø8-10cm; neck ø2-3cm |

The full reference list lives in `references/common-object-dimensions.md`. Do not guess.

## Prerequisites — always check first

Before any work, verify:

1. **Blender MCP is reachable**. Call `mcp__blender__get_scene_info`. If it errors with "Could not connect to Blender":
   > "Blender's MCP addon isn't running. Start Blender, enable the BlenderMCP addon (port 9876 default), then re-run."
   
   Stop and ask the user to fix this.

2. **Scene state**. `get_scene_info` returns the current objects. Decide:
   - **Empty scene?** → Start fresh; build from primitives.
   - **Existing objects?** → Operate on them; do NOT delete unless asked.
   - **Default cube only?** → Probably safe to delete (`bpy.ops.object.delete()`).

3. **The user's actual request**. If ambiguous, ask one question. Otherwise proceed with sensible defaults.

## Intent → sub-skill routing table

For each intent the user expresses, load (via `Read`) the matching sub-skill's `SKILL.md` and follow its patterns. Multiple intents = chain multiple sub-skills.

| User intent (paraphrased) | Load these sub-skills | Order |
|--------------------------|----------------------|-------|
| "Make a 3D model of X" | `blender-modeling` | 1st |
| "From this wireframe drawing" | `wireframe-to-3d` | 1st |
| "Use these materials / make it look like X" | `blender-materials` | After modeling |
| "Light it / studio setup / cinematic" | `blender-lighting` | After geometry exists |
| "Hero shot / camera angle / DoF" | `blender-cameras` | After lighting |
| "Render it / produce an image" | `blender-rendering` | Last visual step |
| "Animate / move / rotate over time" | `blender-animation` | After geometry |
| "Export as glTF / FBX / OBJ / for web / for Unity" | `blender-export` | Final step |
| "Set up a scene / production-quality result" | `blender-pro-workflow` | First — guides everything |
| "I'm new / not sure where to start" | `blender-pro-workflow` | First |
| "This is sub-par / still wrong / same issue again" | `quality-refinement-autoloop`, then `blender-skill-harmonizer` | First — learn, sanitize, patch, then retry |
| "Match these templates / wireframes / textures exactly" | `blender-skill-harmonizer`, then reference-specific fit skills | First — establish source-of-truth gates |

**Multi-intent example**: "Model a sword with materials, light it dramatically, and export as glTF" →
1. `blender-pro-workflow` (sequencing strategy)
2. `blender-modeling` (sword geometry)
3. `blender-materials` (steel + leather grip)
4. `blender-lighting` (dramatic 1-point or rim setup)
5. `blender-export` (glTF settings)

## Pro assembly order (when in doubt)

This order minimizes rework. When the user gives a multi-step request, follow it:

1. **Reference + plan** — note the goal.
2. **Block-out** — primitives + camera + composition. Cheapest to iterate.
3. **Camera lock** — pick focal length, frame the shot.
4. **Light v1** — three-point (key/fill/rim) before any material work. Light defines mood.
5. **Refine geometry** — replace primitives with real models.
6. **Materials v1** — flat colors first, get values right.
7. **Light v2** — color + ratios.
8. **Detail pass** — only after the above is right.
9. **Final render** — production samples + denoise.
10. **Composite** — color grade, glare, vignette.
11. **Export** — for the target platform.

Source: `references/assembly-order.md` (deeper rationale).

## Code-execution rules — non-negotiable

When emitting Python for `mcp__blender__execute_blender_code`:

- **Each call is a fresh namespace.** Only `bpy` is pre-imported; re-import `math`, `bmesh`, `numpy`, etc. each call.
- **Identify objects by stable name**, never by Python variable. `bpy.data.objects['GEO-sword']` works across calls; a `sword = ...` assignment does not.
- **Print structured output** so you can parse it back. End each chunk with `print(f"...")` reporting what changed (object names, vertex counts, file paths).
- **Chunk the work.** 180-second timeout per call. Don't dump 500 lines in one call — split into ~5–20-line chunks.
- **Use Blender Studio naming conventions** for everything you create: `GEO-`, `MAT-`, `LGT-`, `CAM-`, `ARM-`, `COL-`. Never leave anything as `Cube.027`.

## Standard skeleton for every operation

```python
import bpy
# (re-import other modules here as needed)

# 1. Scope: identify or create objects by NAME
obj = bpy.data.objects.get('GEO-target') or bpy.data.objects.new('GEO-target', None)

# 2. Do the work
# ...

# 3. Report
print(f"done:GEO-target {len(obj.data.vertices) if obj.data else 0}")
```

## Naming conventions (apply to everything you create)

| Prefix | Meaning |
|--------|---------|
| `GEO-` | Geometry / mesh objects |
| `MAT-` | Materials |
| `LGT-` | Lights |
| `CAM-` | Cameras |
| `ARM-` | Armatures (rigs) |
| `COL-` | Collections |
| `WGT-` | Custom bone shapes / widgets |

Suffix `.L` / `.R` for left/right. Examples: `GEO-sword_blade`, `MAT-steel_brushed`, `LGT-key`.

## Validation rule of thumb

After significant work, call `mcp__blender__get_scene_info` and verify:
- Expected objects exist with correct names.
- Object counts make sense (no runaway duplication).
- Polycount roughly matches target.

Before reporting success on a render or export, confirm the file actually exists (use `Bash`: `ls -la /path/to/output`).

## When to load deeper references

- **`references/assembly-order.md`** — the canonical scene-assembly sequence, time budgets, recovery patterns. Load when planning a multi-step pipeline or when the user asks "what's the right order?".
- **`references/intent-routing.md`** — fuller intent-to-skill mapping with edge cases. Load when the request is ambiguous and you need to disambiguate.
- **`references/code-execution-rules.md`** — detailed rules for `execute_blender_code` (namespace, timeouts, stdout capture). Load when tracking down execution errors.

## Reporting back to the user

When work is done, report concretely:

- ✅ **Created**: list objects + polycounts.
- ✅ **Lit**: list lights + their roles.
- ✅ **Rendered**: file path + size + dimensions + render time.
- ⚠️ **Warnings**: any auto-decimation, naming conflicts, fallback materials.

Example:
> Created `GEO-sword_blade` (1 240 verts), `GEO-sword_grip` (320 verts).  
> Materials: `MAT-steel_brushed`, `MAT-leather_dark`.  
> Lit with `LGT-key` (warm 3200K), `LGT-fill` (cool 5500K), `LGT-rim` (cool blue).  
> Rendered to `/tmp/sword_hero.png` (1920×1080, 2.3 MB, 38 s with 256 samples + OptiX denoise).

## Failure modes — what to do when…

| Problem | Action |
|---------|--------|
| MCP timeout | Break the failing chunk into smaller pieces |
| `Code execution error: <line>` | Read the error; fix that one line; retry |
| Object not found in next call | You used a Python var instead of `bpy.data.objects['name']` |
| Render took too long | Reduce samples, enable adaptive sampling, lower resolution |
| File not at expected path | Use absolute paths; verify with Bash `ls` |
| Material looks wrong after export | You used non-Principled-BSDF nodes; rebuild material with Principled only |
| `'Action' object has no attribute 'fcurves'` | Blender 5.x layered Actions; walk `action.layers[].strips[].channelbags[].fcurves` instead. See `blender-animation` Recipe 3 for the compat helper. |
| `BLENDER_EEVEE_NEXT` rejected | Blender 5.x renamed it back to `BLENDER_EEVEE`. See `blender-rendering` Recipe 3 for the try/except fallback. |
| `KeyError: 'Subsurface IOR'` (or other input names) | Blender 5.x marks some BSDF inputs `enabled=False` (currently `Weight`, `Subsurface IOR`); they're reachable by iteration but not string-key lookup. See `blender-materials` Recipe 9 for the `set_input` helper. |
| `Error: Cannot render, no camera` | `scene.camera is None`. Always run the `ensure_camera()` guard before any render — see `blender-rendering` Recipes 5 / 6. The orchestrator must check this before chaining to render even if the user's prompt didn't ask for a camera explicitly. |
| User reports "scene is grey / no materials visible" while looking at Blender's viewport | Blender viewport defaults to **Solid** shading mode which ignores materials. The render is correct; only the viewport looks grey. After every scene assembly, set viewport to Material Preview: `space.shading.type = 'MATERIAL'; space.shading.use_scene_lights = True; space.shading.use_scene_world = True` |
| User reports "materials look flat / no texture" | Flat PBR colors lack surface variation. Add procedural textures (Noise/Voronoi → ColorRamp → Roughness or Bump) for steel scratches, hammered metal, leather grain, etc. See `blender-materials` Recipe 12 (procedural wood) for the pattern. |
| Subject looks wrongly proportioned (e.g. blade too short, chair too narrow) | The orchestrator skipped the dimension lookup. Always read `references/common-object-dimensions.md` BEFORE generating modeling code. Don't guess. |
| User asks for a "human" / "character" / "face" / "person" | Pure-recipe primitives produce a recognisable silhouette only, NOT a human face. Suggest one of: (a) `mcp__blender__download_polyhaven_asset` / `download_sketchfab_model` / `generate_hyper3d_model_via_text` for an actual human base mesh, then chain materials + lighting + render; (b) commission a Blender character artist (see `prompts/04-blender-workflow.md`). Do NOT pretend a sphere-with-features looks human — it doesn't. See `references/common-object-dimensions.md` "Characters / avatars" section. |
| Elongated subject renders as a thin pole instead of a recognisable shape | Camera viewing the **thin axis** of an elongated object. Rotate the object so its broad axis faces the camera. See `blender-modeling` "Critical: axis orientation for elongated objects". |
| Blade/spike has a "chiseled flat" tip instead of a point | Top vertices were scaled toward zero but not merged. Use the proper tapering recipe in `blender-modeling` ("Critical: tapering to a point") — collapse top verts to centerline AND `remove_doubles`. |
| Coloured glass renders flat/metallic instead of "glass-like" | Tint set on `Base Color` of Principled BSDF only. Real coloured glass needs **Volume Absorption** for depth-based tint. See `blender-materials` Recipe 6b. Also: `Roughness=0.0` produces mirror-flat highlights that look metallic — use 0.02–0.05 instead. |
| Glass renders black on the inside | `transmission_bounces` too low. Default 12 is insufficient for thick or layered glass. Set `scene.cycles.transmission_bounces = 24`. |

## What this skill is NOT for

- Heavy custom GPU work / writing a render engine (use Blender's existing engines)
- Real-time game logic (use Unity / Unreal directly)
- Sculpting strokes from natural language (sculpting is gestural; use brushes interactively)
- Things outside Blender's capabilities (CAD precision modeling — use FreeCAD; CFD simulation — use Blender's Mantaflow only for VFX-quality, not engineering)

When the user asks for these, redirect them politely and explain.
