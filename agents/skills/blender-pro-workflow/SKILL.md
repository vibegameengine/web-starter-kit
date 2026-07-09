---
name: blender-pro-workflow
description: End-to-end production workflow guidance for Blender — the order to assemble scenes (block-out → camera → light → forms → materials → detail → render → composite → export), critique protocols, time budgets, and recovery patterns. Use whenever the user asks to "make a complete scene / hero shot / production-quality render", "what's the right order to do this", "set up a full pipeline", or has a multi-step request crossing modeling + lighting + materials + rendering. Make sure to use this skill for any request that spans multiple phases of 3D work, even if the user does not say "workflow" — also covers "make a final image of X", "produce a hero render", "professional-looking result".
when_to_use: Multi-phase Blender work spanning modeling + lighting + materials + render. Or when the user is unsure where to start. Often loaded BEFORE other sub-skills as a guide for sequencing.
allowed-tools: Read Bash mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Blender Pro Workflow

End-to-end guidance for putting a real scene together. This skill answers "in what order, with what fidelity at each step, should I tackle this?" Use it as the planner, then chain-load the specific sub-skills for each step.

## Reference-locked override

If a task involves source templates, orthographic references, brand mascots, or fit validation, defer ordering to `blender-skill-harmonizer` and the reference-locked skills. The generic production order is subordinate to source-of-truth gates.

## The 11-step canonical order

```
1.  Reference + plan          → State the goal; collect refs
2.  Block-out                 → Primitives only at correct scale
3.  Camera + composition lock → Pick focal length; frame the shot
4.  Light pass v1             → Three-point lighting; no color yet
5.  Refine geometry           → Replace primitives with real models
6.  Materials v1              → Flat colors; values before color
7.  Light pass v2             → Add color; tune ratios
8.  Detail pass               → Sculpting, fine textures, polish
9.  Final render              → Production samples + denoising
10. Composite                 → Color grade, glare, vignette
11. Export                    → Target platform format
```

**Why this order**: each step gates the next. A great model under bad lighting renders worse than a mediocre model under great lighting. A perfect material tuned in flat lighting will look wrong once real lighting goes in.

## Sub-skill chain by request type

| User request type | Chain (in order) |
|-------------------|-----------------|
| "Hero shot of a sword" | this → blender-modeling → blender-materials → blender-lighting → blender-cameras → blender-rendering |
| "Render this scene cinematically" | this → blender-cameras → blender-lighting → blender-rendering |
| "Make a 3D logo for the web" | this → blender-modeling → blender-materials → blender-lighting → blender-rendering → blender-export |
| "Animate a turntable" | this → blender-modeling → blender-materials → blender-cameras → blender-animation → blender-rendering |
| "Set up a studio scene" | this → blender-cameras → blender-lighting → (then the user adds models) |
| "Full production pipeline" | All of: blender-modeling → blender-materials → blender-lighting → blender-cameras → blender-rendering → blender-export |

## Time budget (for a hero still)

| Stage | % of total time |
|-------|-----------------|
| Reference + plan | 5–10% |
| Block-out + camera | 10–15% |
| Lighting setup | 10–20% |
| Modeling refinement | 30–40% |
| Materials + textures | 15–20% |
| Final render + composite | 5–10% |

**Anti-pattern**: 90% modeling, 10% lighting. Lighting and materials are what make a model *look* good. Don't invest in geometry detail until the value structure of the image works.

## Recipes

### Recipe 1 — Block-out scene scaffold

Use this as the very first step. Establishes scale, composition, camera framing.

```python
import bpy, math

# Ground plane
bpy.ops.mesh.primitive_plane_add(size=10)
bpy.context.active_object.name = 'GEO-blockout_floor'

# Hero subject (placeholder cube)
bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 0.75))
bpy.context.active_object.name = 'GEO-blockout_hero'

# Background prop
bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=2, location=(2, 1.5, 1))
bpy.context.active_object.name = 'GEO-blockout_bg'

# Camera with reasonable framing
cam_data = bpy.data.cameras.new('CAM-blockout')
cam = bpy.data.objects.new('CAM-blockout', cam_data)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.location = (4, -5, 2)
cam.rotation_euler = (math.radians(70), 0, math.radians(35))
cam_data.lens = 50

print('blockout:scaffold_ready (camera + 3 primitives)')
```

After this, render at low quality (Recipe 2) to validate composition before any further work.

### Recipe 2 — Cheap composition test render

Validate the blockout reads. Don't proceed to modeling/lighting until composition is locked.

```python
import bpy

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'   # fast
scene.eevee.taa_render_samples = 16
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 50    # super-fast preview
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '/tmp/blockout_test.png'

bpy.ops.render.render(write_still=True)
print(f"composition_test:/tmp/blockout_test.png")
```

Iterate camera position/focal length until the thumbnail reads. THEN move on.

### Recipe 3 — Three-point lighting on top of blockout

```python
import bpy, math

# KEY warm
key_data = bpy.data.lights.new('LGT-key', type='AREA')
key_data.energy = 1000; key_data.size = 1.0
key_data.color = (1.0, 0.95, 0.85)
key = bpy.data.objects.new('LGT-key', key_data)
bpy.context.collection.objects.link(key)
key.location = (3, -3, 3.5)
key.rotation_euler = (math.radians(35), math.radians(45), 0)

# FILL cool
fill_data = bpy.data.lights.new('LGT-fill', type='AREA')
fill_data.energy = 300; fill_data.size = 2.0
fill_data.color = (0.85, 0.9, 1.0)
fill = bpy.data.objects.new('LGT-fill', fill_data)
bpy.context.collection.objects.link(fill)
fill.location = (-3, -2, 2.5)
fill.rotation_euler = (math.radians(50), math.radians(-45), 0)

# RIM cool
rim_data = bpy.data.lights.new('LGT-rim', type='SPOT')
rim_data.energy = 600; rim_data.color = (0.7, 0.85, 1.0)
rim = bpy.data.objects.new('LGT-rim', rim_data)
bpy.context.collection.objects.link(rim)
rim.location = (0, 4, 3.0)
rim.rotation_euler = (math.radians(120), 0, math.radians(180))

print('lighting:three_point applied to blockout')
```

Render again with this lighting. The blockout should now read with mood. If not, fix lighting before adding any geometry detail.

## Critique protocol — every couple hours

1. **Squint** — blur your eyes / view at thumbnail size. Composition still readable?
2. **Greyscale** — values working independent of color?
3. **Flip horizontal** — catches asymmetry / awkward composition.
4. **Compare to reference** — side-by-side at same size.
5. **Walk away** — 30 minutes; come back fresh.

## Recovery patterns

| Symptom | First check | Fix |
|---------|------------|-----|
| Render "flat" | Lighting variety | Add rim light; increase fill ratio |
| "Too dark" | Exposure / HDRI | View settings → Exposure +0.5; or boost HDRI strength |
| "Too bright" | View transform | Switch from Standard to AgX |
| Materials look "plasticky" | Roughness uniform | Procedural variation on roughness |
| "Videogame-y" | Hard shadows + sharp geo | Soft shadows (Area lights) + bevel everything |
| Anatomy wrong | Reference closed | Reopen reference; compare landmarks |
| Render takes hours | Sample count / bounces | 256 + denoise; reduce light path bounces |

## Pro habits

| Habit | Why |
|-------|-----|
| Always rename `Cube` to `GEO-meaningful_name` immediately | Avoids `Cube.027` hell |
| Apply rotation+scale before exporting | Avoids transform issues in target apps |
| Use Collections (not parenting) for grouping | More flexible |
| Save incremental versions (`scene_v01.blend`, `_v02`, ...) | Mistake recovery |
| Pack textures into .blend for sharing | `File → External Data → Pack All` |
| Delete unused data periodically | Keeps file small |
| Comment Python scripts | Future-you will thank you |

## What pros do less

- Tweaking individual vertices when a modifier achieves the same
- Hunting for "perfect" tutorials instead of practicing fundamentals
- Adding more lights when fixing one bad light would solve the problem
- Modeling everything when an HDRI / asset would suffice

## What pros do more

- Looking at reference at every step
- Saving incremental versions
- Naming things immediately
- Critiquing harshly and often
- Walking away to reset eyes
- Testing renders at low quality first
- Reusing asset libraries

## When to load `references/overview.md`

Load when:
- Estimating how long something will take (specific time benchmarks)
- Choosing addons (when paid tools justify their price)
- Planning iteration protocol for client work
- Solo-vs-team workflow differences

The reference covers: scene assembly order with deeper rationale, time budgets per stage, critique workflow, recovery patterns, when to use addons (MESHmachine, Auto-Rig Pro, RetopoFlow, HDRI Studio).
