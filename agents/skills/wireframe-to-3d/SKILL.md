---
name: wireframe-to-3d
description: Convert 2D orthographic wireframe PNG drawings to 3D Blender models exported as glTF/GLB. Use this skill whenever the user provides wireframe images (technical drawings, line drawings, orthographic views, side/front/back panels) and wants to generate a 3D model, mesh, or .glb file. Triggers on phrases like "convert this wireframe to 3D", "make a 3D model from these drawings", "build a model from this wireframe", "generate GLB from these views", or any image-to-3D-mesh request involving line drawings. Make sure to use this skill even if the user does not explicitly say "wireframe" — also covers "orthographic views", "technical drawings", "line drawings of objects", "front and side views". Requires the Blender MCP addon to be running (port 9876) and Python with opencv-python, numpy, scipy installed.
when_to_use: User provides one or more PNG wireframe images and wants a 3D model. Also use when user asks to model an object from front/side/back drawings, or to convert technical line art to glTF/GLB.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info mcp__blender__get_viewport_screenshot
---

# Wireframe-to-3D Conversion

Convert 2D orthographic wireframe images to parametric 3D Blender models, exported as glTF 2.0 binary (`.glb`).

## Overview

The skill drives a four-stage pipeline:
1. **Analyze** wireframe images locally with `scripts/wireframe_analyzer.py` (OpenCV → Bezier control points in JSON).
2. **Generate** Blender Python code that recreates the contours as parametric Bezier curves.
3. **Execute** code in Blender via `mcp__blender__execute_blender_code`, converting curves to meshes with PBR materials.
4. **Export** as optimized GLB (≤ 15 MB), validating size and topology.

You (Claude) are the orchestrator. The `scripts/` directory contains the only standalone code (`wireframe_analyzer.py`); everything else is patterns you emit and run via MCP.

## Prerequisites — check first

Before any wireframe work, verify the environment:

1. **Blender MCP is reachable**. Call `mcp__blender__get_scene_info`. If it errors with "Could not connect to Blender", stop and tell the user:
   > "Blender's MCP addon isn't running. Start Blender, enable the BlenderMCP addon (port 9876), then re-run."

2. **Python deps for the analyzer**. Run:
   ```
   python3 -c "import cv2, numpy, scipy" 2>&1
   ```
   If it errors, run `pip install opencv-python numpy scipy Pillow` (or instruct the user to).

3. **Image input**. Confirm the user provided at least one PNG. Reasonable bounds: ≥ 400×400 px, black-on-white or white-on-black line art.

## Decision flow

### Q1: How many views?
- **Single view** → flat 2D extrusion only (warn the user; depth must be supplied or assumed).
- **Front + side** → full 3D reconstruction (silhouette × depth profile).
- **Front + side + back** → use back view for symmetry validation.

### Q2: Detail level?
- **`preview`** — RDP epsilon = 4.0, target ~1–2k tris, < 1 MB GLB.
- **`production`** — RDP epsilon = 2.0, target ~5–8k tris, 2–4 MB GLB. **Default.**
- **`high`** — RDP epsilon = 1.0, target ~10–20k tris, may need Decimate to stay under 15 MB.

### Q3: Geometry type?
- **`wires`** — frames, arms, hinges. Use `bevel_depth` on curves.
- **`surfaces`** — lenses, domes. Use lofted profiles or fill caps.
- **`hybrid`** — both. **Default for glasses-like objects.**

### Q4: Real-world scale?
- If the user gave dimensions (e.g., "glasses are 140 mm wide"), use them.
- Otherwise infer from wireframe aspect ratio and assume a sensible default (140 mm width for glasses, 180 mm for helmets, etc.). Confirm with user if not obvious.



## Mandatory correction loop for reference/texture-driven subjects

When user feedback says the model does not match the reference/texture, stop the normal "generate from primitives" loop and switch to **reference-locked modeling**:

1. **Count visible design parts first** from the provided texture/wireframe and write the count into stdout/notes before modeling. Do not infer a radial or repeated count from symmetry; the visual design count in the source manifest is the contract.
2. **Use the front view as canonical.** Create an image-empty/plane/reference overlay in the same front orthographic camera used for validation. Align scale, centerline, and bounding circle before adding depth.
3. **Trace or define 2D silhouettes in front-view X/Z first.** Build mesh surfaces from those silhouettes; do not place generic ellipses and then try to texture them.
4. **Lock the front projection.** Add depth only on the view axis after the front silhouette matches. Side/back views refine thickness and stacking but must not alter the front outline.
5. **Use Project-from-View-style UVs** for any texture that is meant to match the front drawing. One front-facing surface should map to the corresponding texture crop 1:1.
6. **Render an overlay validation**: reference/wireframe behind or over the model, plus a printed checklist: expected count, actual object count, face position, outer silhouette bounds, and side/back depth.
7. If an iteration repeats the same error twice, consult `references/best-practices.md` and add a short durable note before another attempt.

For repeated motif subjects, create exactly the primary structural components declared by the source manifest. Name them by source-visible position or semantic role, and validate the count before export.


## Stage 1 — Run the analyzer

Run the bundled analyzer once per view:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/wireframe_analyzer.py <input.png> <output.json>
```

The script outputs JSON with this shape:
```json
{
  "metadata": {"image_size": [W, H], "num_contours": N, "parameters": {...}},
  "contours": [[[x, y], ...], ...],
  "bezier_curves": [[[[P0], [P1], [P2], [P3]], ...], ...]
}
```

**Tuning RDP epsilon** (only if defaults fail):
- Output has too few/jagged contours → lower epsilon to 1.0–1.5.
- Output has too many noisy points → raise epsilon to 3.0–4.0.
- Pass via `--rdp-epsilon` (or edit the call in the script).

Read the JSON with `Read`. Do not pass huge JSON blobs to Blender — extract what you need first.

## Stage 2 — Generate Blender code

Build code in **small, self-contained chunks** (each `execute_blender_code` call gets a fresh Python namespace; only `bpy.data` persists between calls). Always re-import what you need.

### Pattern: create a Bezier curve from control points

```python
import bpy

# Identify by stable name; bpy.data persists between calls.
name = 'GEO-lens-right'

curve_data = bpy.data.curves.new(name=name, type='CURVE')
curve_data.dimensions = '3D'
curve_data.resolution_u = 16    # tessellation resolution
curve_data.bevel_depth = 0.001  # 1 mm wire thickness (adjust for surfaces)
curve_data.use_fill_caps = True

obj = bpy.data.objects.new(name, curve_data)
bpy.context.collection.objects.link(obj)

# Control points come from the analyzer JSON (px → mm scaling done client-side).
control_points = [(0.0, 0.0, 0.0), (0.5, 1.0, 0.0), (1.5, 1.0, 0.0), (2.0, 0.0, 0.0)]

spline = curve_data.splines.new(type='BEZIER')
spline.bezier_points.add(len(control_points) - 1)
for i, (x, y, z) in enumerate(control_points):
    pt = spline.bezier_points[i]
    pt.co = (x, y, z)
    pt.handle_left_type = 'ALIGNED'   # C¹ smooth
    pt.handle_right_type = 'ALIGNED'

print(f"created:{name}")  # signal back via stdout
```

**Pixel → world conversion** (do this in the code you generate, before sending to Blender):
```
norm_x = px_x / img_width
norm_y = 1.0 - (px_y / img_height)   # flip Y; image origin is top-left
x_world = (norm_x - 0.5) * world_width_mm / 1000.0   # to metres
y_world = (norm_y - 0.5) * world_height_mm / 1000.0
```

### Pattern: convert curves to mesh + cleanup

```python
import bpy

name = 'GEO-lens-right'
obj = bpy.data.objects[name]

bpy.context.view_layer.objects.active = obj
bpy.ops.object.convert(target='MESH')

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()

mesh = obj.data
print(f"mesh:{name} verts:{len(mesh.vertices)} polys:{len(mesh.polygons)}")
```

### Pattern: PBR material (Principled BSDF — the only shader glTF exports cleanly)

```python
import bpy

mat = bpy.data.materials.get('MAT-frame-metal') or bpy.data.materials.new('MAT-frame-metal')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.08, 0.08, 0.10, 1.0)
bsdf.inputs['Metallic'].default_value = 1.0
bsdf.inputs['Roughness'].default_value = 0.25

obj = bpy.data.objects['GEO-frame']
if obj.data.materials:
    obj.data.materials[0] = mat
else:
    obj.data.materials.append(mat)
print('material:assigned')
```

**Material presets** (use these unless the user specifies):
- `MAT-frame-metal` — `(0.08, 0.08, 0.10)` base, metallic=1.0, roughness=0.25 (brushed steel)
- `MAT-lens-mirror` — `(0.05, 0.08, 0.15)` base, metallic=0.8, roughness=0.05, IOR=1.5 (mirror glass)
- `MAT-pad-silicone` — `(0.65, 0.63, 0.60)` base, metallic=0.0, roughness=0.7 (matte silicone)

### Pattern: export to GLB

```python
import bpy, os

filepath = '/tmp/wireframe_output.glb'
bpy.ops.export_scene.gltf(
    filepath=filepath,
    export_format='GLB',
    export_materials='EXPORT',
    export_uv=True,
    export_normals=True,
    export_animations=False,
    export_yup=True,
)
size_mb = os.path.getsize(filepath) / (1024 * 1024)
print(f"export:{filepath} size_mb:{size_mb:.2f}")
```

If `size_mb > 15`: apply Decimate and re-export (see error recovery).

## Stage 3 — Validate

After the full pipeline, validate before declaring success:

1. `mcp__blender__get_scene_info` — confirm expected objects exist.
2. For paired parts (left/right lens), call `mcp__blender__get_object_info` on each and compare bounding box widths. Tolerance: 1 mm.
3. Triangle count: get via `get_object_info`. If a part exceeds budget, plan Decimate.
4. File size: must be ≤ 15 MB hard cap, ideally ≤ 8 MB.

## Error recovery

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Code execution error: ...` from MCP | Bad Python in generated code | Re-emit code in smaller chunks; trace the line from the error message |
| `Could not connect to Blender` | Addon not running | Tell the user to start Blender + addon |
| `Timeout waiting for Blender response` | Code chunk too large or slow | Break into smaller `execute_blender_code` calls |
| Variables undefined across calls | Each call gets a fresh namespace | Re-import modules; refer to objects by `bpy.data.objects['name']` |
| Analyzer outputs 0 contours | Image too low contrast | Re-run with `--gaussian-kernel 7 --canny-t1 30` |
| Asymmetric lenses | Original drawing asymmetric, or contour detection inconsistent | Warn the user; do not auto-mirror unless asked |
| GLB too large | High poly count or embedded textures | Apply `DECIMATE` modifier with ratio 0.6–0.8; re-export |
| Mesh has holes | Curve resolution too low | Raise `curve_data.resolution_u` to 24 or 32; reconvert |
| Material missing in GLB | Used non-Principled-BSDF nodes | Rebuild material using only Principled BSDF |

### Decimate code pattern (when GLB > 15 MB)

```python
import bpy

obj = bpy.data.objects['GEO-frame']
bpy.context.view_layer.objects.active = obj

mod = obj.modifiers.new(name='Decimate', type='DECIMATE')
mod.ratio = 0.7
mod.use_collapse_degenerate = True
bpy.ops.object.modifier_apply(modifier=mod.name)
print(f"decimated:{obj.name} verts:{len(obj.data.vertices)}")
```

## Output to user

When done, report:
- Output path of the GLB file
- File size in MB (vs 15 MB cap)
- Triangle count per part (vs 30 000 cap)
- Material slots assigned
- Any warnings (asymmetry, decimation applied, fallbacks used)

Example:
> ✓ Exported `/tmp/wireframe_output.glb` (2.4 MB)  
> Triangles: 5 200 (3 parts: GEO-frame, GEO-lens-right, GEO-lens-left)  
> Materials: MAT-frame-metal, MAT-lens-mirror  
> Warnings: none

## When to load deeper references

The body above covers the 80% case. For the long tail, load these on demand:

- **`references/algorithms.md`** — image-processing pipeline theory (Canny, RDP, least-squares Bezier fitting), 2D-to-3D reconstruction principles, ISO 128 orthographic standards. Load when the analyzer output looks wrong and you need to tune parameters.
- **`references/blender-patterns.md`** — exhaustive Blender Python patterns (lofting, surface revolution, custom modifier stacks). Load when the user requests non-standard geometry (curved surfaces, complex bridges, articulated parts).
- **`references/best-practices.md`** — performance optimization (`foreach_set`, batch ops, context caching), naming conventions (Blender Studio standards), modifier stack ordering. Load when builds are slow or output topology is poor.

## Constraints

- **Blender ≥ 4.0** (5.x preferred). The Principled BSDF node and glTF exporter are stable across these versions.
- **glTF embedded only** (no `.bin` + textures sidecar; no KTX2/Draco compression — Three.js needs extra loaders we haven't vendored).
- **PNG textures only** (max 1024×1024). Prefer flat PBR colours; textures only when essential.
- **No bone animations** in the GLB. Idle motion is driven in JS by the consumer site.

## Tip

If the user just says "convert this wireframe", default to: `view_type=auto-detect`, `detail_level=production`, `geometry_type=hybrid`, `world_width_mm=auto`. Only ask for clarification if multiple interpretations are plausible.

## Scope boundary — what wireframe-to-3d does and doesn't produce

This skill produces **2D outline tracing extruded to thin curves** — a flat-in-Y wireframe representation of the input drawing. It does **not** produce:

- Filled surfaces (e.g. lens glass between rim outlines)
- True 3D depth from a single view (output is flat in Y)
- Multi-view 3D reconstruction (front + side views combined volumetrically)
- Sub-features not in the input lines (nose pads, articulated hinges, etc.)
- Production-quality materials (placeholder only — real materials come from `blender-materials`)

For a "complete rendered and textured X" (e.g. Ray-Ban Aviator from a wireframe), **chain this skill with others**:

| Step | Skill | What it adds |
|------|-------|--------------|
| 1 | `wireframe-to-3d` | Frame outline as 3D curves — **the foundation, not the deliverable** |
| 2 | `blender-modeling` | Filled lens discs (UV spheres scaled to lens dimensions); temple arms (Bezier curves extending backward in Y); any 3D detail not in the wireframe |
| 3 | `blender-materials` | Gold/silver metal frame; mirror lens material with `Metallic=0.9, Roughness=0.04`; etc. |
| 4 | `blender-lighting` | `subject_class='metal'` for product-shot lighting |
| 5 | `blender-cameras` | 85-100mm focal length, shallow DoF for hero product shot |
| 6 | `blender-rendering` | Cycles 256+ samples, denoise, AgX view transform |

See `text-to-blender/assets/v0.9.0-validation/03_aviator_wireframe_to_3d.webp` for what wireframe-to-3d produces alone (flat outline tracing) vs `04_aviator_chained_upgrade.webp` for what the chained orchestration produces (a Ray-Ban-style hero render).

**The orchestrator (`text-to-blender`) should always plan for the chain** when the user asks for a "model of X" from a wireframe.
