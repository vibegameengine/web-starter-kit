# Rendering — Pro Knowledge Overview

**Domain**: 11 — Cycles, EEVEE, samples, denoising, light paths, performance  
**Status**: Initial pass complete  
**Last update**: 2026-04-27

---

## The two engines (Cycles vs EEVEE)

| | Cycles | EEVEE |
|---|--------|-------|
| **Type** | Physically-based path tracer | Real-time rasterizer (OpenGL/Vulkan) |
| **Render time** | Minutes to hours | Seconds |
| **Realism** | Photoreal (when tuned) | Approximate (real-time tricks) |
| **Caustics** | ✅ Full support | ❌ Faked or none |
| **Subsurface scattering** | ✅ Accurate | ⚠️ Screen-space approximation |
| **Volumetrics** | ✅ Accurate | ⚠️ Limited |
| **Reflections** | ✅ Real | ⚠️ Screen-space + cube maps |
| **GPU acceleration** | ✅ CUDA, OptiX, HIP, Metal | ✅ Native |
| **Best for** | Hero shots, archviz, product, VFX | Animation previews, motion graphics, stylized |

**Decision rule**:
- **Need realism, complex lighting, caustics, accurate SSS** → Cycles
- **Need speed, animation, real-time iteration, stylized look** → EEVEE
- **Don't know yet** → start with EEVEE, switch to Cycles for finals

---

## Cycles render settings (the production presets)

```python
import bpy

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'   # or 'CPU'

# Sampling — the most important setting
scene.cycles.samples = 256                    # main sample count
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.01        # noise threshold
scene.cycles.adaptive_min_samples = 32        # never go below this

# Denoising (recommended ON for production)
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPTIX'               # 'OPTIX' (NVIDIA only, fastest), 'OPENIMAGEDENOISE' (CPU, universal)

# Tile size (auto on modern Blender)
# Older Blender: scene.cycles.tile_size = 512 for GPU, 32 for CPU
```

### Sample count guide

| Scene type | Samples | Why |
|------------|---------|-----|
| Outdoor, direct sun | 64–128 | Mostly direct light, low noise |
| General product/portrait | 256 | Standard quality |
| Indoor with bounce light | 512 | More indirect light = more noise |
| Caustics, glass, complex SSS | 1024–2048 | Hardest to converge |
| Final hero shot | 1024 + denoising | Polish |

**Key insight**: Adaptive sampling (default in Blender 4.x+) dynamically allocates samples per pixel — clean areas get fewer, noisy areas get more. This lets you set a high `samples` value (e.g., 1024) without massive overrender; adaptive threshold stops sampling when noise drops below threshold.

### Light paths

Controls how many times rays bounce. More bounces = more accurate, more time.

| Setting | Default | When to increase |
|---------|---------|-----------------|
| **Total bounces** | 12 | Caustics, glass-rich scenes (try 16) |
| **Diffuse** | 4 | Bright interior with bounces (try 8) |
| **Glossy** | 4 | Mirror corridors (try 8) |
| **Transmission** | 12 | Glass, water (often need 16–24) |
| **Volume** | 0 | Increase to 4+ for fog, smoke |
| **Transparent** | 8 | Stacked alpha (foliage) |

```python
scene.cycles.max_bounces = 12
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 4
scene.cycles.transmission_bounces = 12
scene.cycles.volume_bounces = 0
scene.cycles.transparent_max_bounces = 8
```

**Pro pitfall**: Rendering glass/transparent scenes with too few transmission bounces = black artifacts. If glass renders black, increase transmission bounces.

---

## EEVEE render settings

```python
import bpy

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'   # Blender 4.2+; older: 'BLENDER_EEVEE'

# Sample count (way fewer than Cycles)
scene.eevee.taa_render_samples = 64    # final render
scene.eevee.taa_samples = 16            # viewport

# Critical features
scene.eevee.use_gtao = True             # screen-space AO (cheap, looks good)
scene.eevee.gtao_distance = 0.2         # AO distance
scene.eevee.use_bloom = True            # glow effects
scene.eevee.use_ssr = True              # screen-space reflections
scene.eevee.use_ssr_refraction = True   # screen-space refraction (glass)
scene.eevee.use_volumetric_lights = True
scene.eevee.use_motion_blur = True      # if needed

# Shadows
scene.eevee.shadow_cube_size = '1024'   # cube shadow map resolution
scene.eevee.shadow_cascade_size = '2048' # for sun shadows
```

**EEVEE limitations to know**:
- **Reflections** are screen-space — can't reflect what's off-screen.
  - Workaround: place **Reflection Plane** or **Reflection Cubemap** probes manually.
- **Refraction** is screen-space — same limitation.
  - Workaround: enable `Screen Space Refraction` in material, set thickness.
- **Indirect light** baked, not real-time.
  - Workaround: place **Light Probes** (Cubemap/Grid) and bake.
- **Caustics** essentially unsupported.
- **Subsurface** is single-bounce screen-space approximation.

---

## Denoising deep dive

### OptiX denoiser (NVIDIA RTX cards)
- Fastest
- Built into NVIDIA drivers
- Quality: very good
- Limitation: NVIDIA only

### OpenImageDenoise (OIDN)
- Intel's AI denoiser
- Runs on CPU (any platform)
- Quality: excellent for most scenes
- Default + recommended in Blender 4.x

### When NOT to use denoising
- Stylized / cell-shaded looks (denoiser smooths intentional grain)
- Scenes where noise IS the texture (pencil shading, halftones)
- Animation with thin moving features (denoiser may flicker between frames)

### Animation denoising
For animation, use **Temporal Denoiser** (Cycles) which considers neighboring frames — reduces flickering.

```python
scene.cycles.denoising_use_animation = True
scene.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'  # better quality
```

---

## Color management and output

```python
import bpy

scene = bpy.context.scene

# View transform (the "look")
scene.view_settings.view_transform = 'AgX'        # Blender 4.x default; warm, filmic
# Alternatives: 'Standard', 'Filmic', 'False Color' (for debugging exposure)

scene.view_settings.look = 'AgX - Medium High Contrast'

# Exposure / gamma (per-render, post)
scene.view_settings.exposure = 0.0      # +1 = double brightness
scene.view_settings.gamma = 1.0

# Output format
scene.render.image_settings.file_format = 'PNG'   # for stills
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '16'    # for HDR / compositing later

# Resolution
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
```

**View transform key facts**:
- **AgX** (default 4.x+) — replaces Filmic, handles bright values gracefully, prevents oversaturation
- **Filmic** (3.x default) — similar to AgX, slightly different color science
- **Standard** — sRGB linear; oversaturates highlights; use only for non-photographic output
- **False Color** — debugging tool: shows exposure as colors

---

## Performance optimization

### 1. Use GPU when possible
```python
scene.cycles.device = 'GPU'

# Configure compute device in preferences (one-time setup)
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'   # or 'CUDA', 'HIP' (AMD), 'METAL' (Mac)
for device in prefs.devices:
    device.use = True
```

### 2. Lower light paths first
Total bounces 12 → 8: ~30% faster. Visual difference often imperceptible.

### 3. Higher noise threshold
Adaptive threshold 0.01 → 0.05: 50%+ faster, slight noise increase (denoiser fixes).

### 4. Persistent Data
```python
scene.render.use_persistent_data = True
```
For animation: keep mesh data between frames (saves ~10% on simple animations, much more on complex).

### 5. Resolution percentage for previews
```python
scene.render.resolution_percentage = 50  # half res for tests
```

### 6. Simplify modifiers
For animation:
```python
scene.render.use_simplify = True
scene.render.simplify_subdivision = 1   # cap SubSurf at level 1
scene.render.simplify_subdivision_render = 2
```

### 7. Disable expensive features in viewport
- Volumetrics, motion blur, depth of field — render only.

---

## Animation rendering

```python
import bpy

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 240
scene.render.fps = 24

scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '//render/anim_'   # // = relative to .blend file

bpy.ops.render.render(animation=True)
```

**Pro pattern for animation**:
1. Render to **PNG sequence**, never directly to video.
2. Encode to MP4 with `ffmpeg` after — easy to re-encode, recover from interrupted renders.
3. Use **persistent data** to speed up.
4. Use **placeholder + overwrite** flags to resume interrupted renders:
   ```python
   scene.render.use_placeholder = True
   scene.render.use_overwrite = False
   ```

---

## Common pitfalls

| Mistake | Why | Fix |
|---------|-----|-----|
| 4096 samples + no denoising | Burns hours unnecessarily | 256 + denoise = same quality, 16× faster |
| EEVEE for archviz interior | Bounce light wrong | Use Cycles |
| Cycles GPU not enabled | CPU is 10× slower | Configure compute device in preferences |
| Render direct to MP4 | Lost work on crash | PNG sequence + ffmpeg |
| Standard view transform | Bright lights blow out | Use AgX or Filmic |
| Default 12 bounces with glass scene | Black glass | Increase transmission bounces to 16+ |
| No simplify on animation | Slow | Cap subdivision in render settings |
| Forgot to set output path | Renders nowhere | `scene.render.filepath = '/tmp/...'` |

---

## Sources

- [SuperRenders — Blender Render Settings 2026 Guide](https://superrendersfarm.com/article/blender-render-settings-optimization-guide)
- [SuperRenders — Render Animation Complete Guide 2026](https://superrendersfarm.com/article/blender-render-animation-complete-guide)
- [GarageFarm — EEVEE vs Cycles](https://garagefarm.net/blog/eevee-vs-cycles)
- [Renderday — How to Speed Up Rendering](https://renderday.com/blog/speed-up-your-renders)
- [UhiyamaLab — Complete Guide to Render Settings (Cycles vs EEVEE)](https://uhiyama-lab.com/en/notes/blender/rendering-settings-cycles-eevee/)
- [CG Cookie — Cycles vs EEVEE: 15 limitations of real-time rendering](https://cgcookie.com/posts/blender-cycles-vs-eevee-15-limitations-of-real-time-rendering)
- [Alasali 3D — When to use each render engine](https://alasali3d.com/eevee-vs-cycles-in-blender-when-to-use-each-render-engine/)

---

## Outstanding

- [ ] Specific render presets per scenario (archviz, product, character)
- [ ] Light Group + compositor workflow for re-lighting in post
- [ ] Render farm setup (Cycles distributed)
- [ ] AOV (custom render passes) detailed setup
