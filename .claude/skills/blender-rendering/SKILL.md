---
name: blender-rendering
description: Render Blender scenes with the right engine and settings — Cycles for photoreal, EEVEE for speed/stylized, sample counts, denoising (OptiX/OIDN), light path tuning, color management (AgX/Filmic), file output (PNG/EXR/MP4), animation rendering. Use whenever the user asks to "render this", "produce an image", "render a frame / animation", "make a final image", "save the render", or any output-generation request. Make sure to use this skill even if the user does not say "render" — also covers "make a picture", "save the result", "produce a final image", "export as image".
when_to_use: Any image or animation render output request in Blender.
allowed-tools: Read Bash mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Blender Rendering

Render efficiently. The defaults are wrong for production; the recipes below are tuned for the common cases.

## Engine decision tree

```
Need photoreal? Caustics? Accurate SSS? Glass-rich?
├── YES → Cycles (path tracer)
└── NO  → Need speed? Stylized look? Animation iteration?
          ├── YES → EEVEE
          └── NO  → Cycles (default fallback for photoreal)
```

**Quick rule**:
- Stills, archviz, product, hero shots → **Cycles**
- Animation previews, motion graphics, stylized → **EEVEE**

## Reference-look handoff

If the goal is to match an original/reference image rather than make a generally attractive render, chain-load `reference-look-calibration`. It owns measurement of hue/saturation/value, object extent, glow/aura color, and before/after look metrics. This skill should then apply the requested material/lighting/render changes within that calibrated target.


## Recipes

### Recipe 1 — Cycles production preset (256 samples + denoise)

```python
import bpy

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'

# Sampling
scene.cycles.samples = 256
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.01
scene.cycles.adaptive_min_samples = 32

# Denoising (recommended)
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'   # safe default; switch to 'OPTIX' on NVIDIA RTX

# Light paths (defaults are reasonable; bump transmission for glass-rich scenes)
scene.cycles.max_bounces = 12
scene.cycles.transmission_bounces = 12

# Resolution
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100

print('render:cycles_production_preset')
```

### Recipe 2 — Cycles draft preset (faster iteration)

```python
import bpy

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'
scene.cycles.samples = 64
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.05
scene.cycles.use_denoising = True
scene.render.resolution_percentage = 50    # half res for tests
print('render:cycles_draft')
```

### Recipe 3 — EEVEE preset

```python
import bpy

scene = bpy.context.scene

# Engine name changed across versions:
#   Blender ≤ 4.1:        'BLENDER_EEVEE'
#   Blender 4.2 only:     'BLENDER_EEVEE_NEXT' (transitional; replaced)
#   Blender ≥ 5.0:        'BLENDER_EEVEE' (the new EEVEE replaced the old)
# Try the new name first; fall back if it doesn't exist on this Blender.
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except (TypeError, ValueError):
    scene.render.engine = 'BLENDER_EEVEE'

# EEVEE settings (eevee namespace exists in 4.x and 5.x)
if hasattr(scene, 'eevee'):
    scene.eevee.taa_render_samples = 64
    scene.eevee.taa_samples = 16
scene.eevee.use_gtao = True            # screen-space AO
scene.eevee.gtao_distance = 0.2
scene.eevee.use_bloom = True            # glow
scene.eevee.use_ssr = True              # screen-space reflections
scene.eevee.use_ssr_refraction = True   # for glass
scene.eevee.use_volumetric_lights = True
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
print('render:eevee_preset')
```

**EEVEE limitations to know**:
- Reflections are screen-space (can't reflect what's off-screen) — workaround: place Reflection Plane / Cubemap probes
- Same for refraction
- Indirect light baked, not real-time — bake Light Probes for accurate bounce
- No accurate caustics

### Recipe 4 — Color management

```python
import bpy

scene = bpy.context.scene

# View transform — controls the "look" mapping HDR → display
scene.view_settings.view_transform = 'AgX'         # default Blender 4.x; replaces Filmic
scene.view_settings.look = 'AgX - Medium High Contrast'

# Or: 'Filmic' (older but still supported), 'Standard' (oversaturates highlights)

scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0
print('render:colormanagement_AgX')
```

**Rule**: Never use 'Standard' for photographic output — it blows out highlights. AgX or Filmic almost always.

### Recipe 5 — Render a single frame to PNG

⚠ **`bpy.ops.render.render()` fails with `Error: Cannot render, no camera` if `scene.camera` is None.** Always run the camera guard first. The guard auto-assigns the first CAMERA-type object if the scene has any, and raises a clear error otherwise.

```python
import bpy

scene = bpy.context.scene

# Camera guard — required before every render
def ensure_camera(scene):
    if scene.camera is not None:
        return scene.camera.name
    cams = [o for o in bpy.data.objects if o.type == 'CAMERA']
    if not cams:
        raise RuntimeError("No camera in scene — add one before rendering")
    scene.camera = cams[0]
    return cams[0].name

cam_name = ensure_camera(scene)
print(f"camera:{cam_name}")

scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '16'    # 16-bit for compositing later
scene.render.filepath = '/tmp/output_hero.png'

bpy.ops.render.render(write_still=True)
print(f"render:saved {scene.render.filepath}")
```

After this, verify with Bash: `ls -la /tmp/output_hero.png` — confirm file exists and report size.

### Recipe 6 — Render an animation as PNG sequence

```python
import bpy

scene = bpy.context.scene

# Camera guard — same pattern as Recipe 5
def ensure_camera(scene):
    if scene.camera is not None:
        return scene.camera.name
    cams = [o for o in bpy.data.objects if o.type == 'CAMERA']
    if not cams:
        raise RuntimeError("No camera in scene — add one before rendering")
    scene.camera = cams[0]
    return cams[0].name

cam_name = ensure_camera(scene)
print(f"camera:{cam_name}")

scene.frame_start = 1
scene.frame_end = 240
scene.render.fps = 24

scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '/tmp/anim/frame_'   # output: frame_0001.png, frame_0002.png, ...

# Resilience: keep partial work on crash
scene.render.use_placeholder = True
scene.render.use_overwrite = False

# Reuse mesh data between frames (faster)
scene.render.use_persistent_data = True

bpy.ops.render.render(animation=True)
print('render:animation_done')
```

**Pro pattern**: render to PNG sequence, then encode to MP4 with ffmpeg afterward:

```bash
ffmpeg -framerate 24 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 anim.mp4
```

### Recipe 7 — Performance tuning for slow renders

```python
import bpy

scene = bpy.context.scene

# 1. Cap subdivision in render
scene.render.use_simplify = True
scene.render.simplify_subdivision = 1
scene.render.simplify_subdivision_render = 2

# 2. Higher noise threshold (faster, more denoiser-dependent)
scene.cycles.adaptive_threshold = 0.05

# 3. Lower light path bounces (lose some realism)
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 3
print('render:performance_tuned')
```

### Recipe 8 — Configure GPU compute device (one-time)

```python
import bpy

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'   # or 'CUDA', 'HIP' (AMD), 'METAL' (Mac)
for device in prefs.devices:
    device.use = True
print(f"gpu:{prefs.compute_device_type} devices:{len(prefs.devices)}")
```

This is a Blender preference — only needs to run once per machine.

## Sample count guide

| Scene type | Samples | Why |
|------------|---------|-----|
| Outdoor, direct sun | 64–128 | Mostly direct light |
| General product/portrait | 256 | Standard quality |
| Indoor with bounce | 512 | More indirect = more noise |
| Caustics, glass, complex SSS | 1024–2048 | Hardest to converge |

Always pair with denoising. 256 samples + denoise ≈ 4096 raw samples in visual quality.

## Common pitfalls

| Symptom | Fix |
|---------|-----|
| `Error: Cannot render, no camera` | `scene.camera is None`. Use the `ensure_camera()` guard at the top of Recipes 5/6 — it auto-assigns the first CAMERA object or raises a clear error if none exists |
| Render takes hours | Reduce samples; enable adaptive; lower bounces |
| Cycles GPU not used | Configure compute device in preferences (Recipe 8) |
| Render direct to MP4 lost on crash | Render PNG sequence, encode after |
| Standard view transform → blown highlights | Use AgX or Filmic |
| Glass renders black | Increase transmission_bounces (16+) |
| EEVEE missing reflections | Add Reflection Plane / Cubemap probes |
| Animation flickers between frames | Use persistent data; consider temporal denoising |
| Output file empty / nothing rendered | Set `scene.render.filepath` first; check `write_still=True` for stills |

## When to load `references/overview.md`

Load when:
- Need detailed engine comparison (Cycles vs EEVEE feature matrix)
- Tuning light paths for specific scene types (caustics, foliage, hair)
- Light groups for re-lighting in compositor
- AOV / custom render passes
- Distributed / farm rendering

The reference covers: full Cycles vs EEVEE matrix, sample-count guides per scene, denoiser comparison (OptiX vs OIDN), light-path bounce tuning, color management deep-dive, and animation rendering best practices.
