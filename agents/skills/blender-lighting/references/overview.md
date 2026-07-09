# Lighting — Pro Knowledge Overview

**Domain**: 07 — Three-point, HDRI, studio, dramatic, environmental  
**Status**: Initial pass complete  
**Last update**: 2026-04-27

---

## The light types Blender gives you

| Type | What it is | When to use |
|------|-----------|-------------|
| **Point** | Light from a single point in all directions | Bulbs, candles, small omnidirectional sources |
| **Sun** | Parallel rays (infinitely far) | Sunlight, moonlight, distant strong sources |
| **Spot** | Cone of light (with falloff) | Stage lights, headlights, focused beams |
| **Area** | Light from a rectangular/disk surface | Soft fill light, window light, softboxes |
| **HDRI / World** | 360° environment image | Realistic ambient, outdoor scenes, product photography |

**Default rule**: For physically-correct lighting, use Area lights for everything except sun. Area lights produce soft shadows automatically (no fiddling with shadow blur).

---

## Three-point lighting (the canonical setup)

```
                    [KEY LIGHT]
                  brightest, defines mood
                   typically 45° front-right
                              \
                               \
                                v
[FILL LIGHT]    →    [ SUBJECT ]    ←    [BACK / RIM LIGHT]
shadow softener,                            edge separation,
opposite key light,                          behind subject,
1/4 to 1/2 brightness                       cool color,
of key                                       1/2 to equal key
```

**Recipe in Python**:
```python
import bpy
import math

subject_loc = (0, 0, 1.6)  # eye level

# KEY LIGHT (front-right, 45° elevation, warm)
key_data = bpy.data.lights.new('LGT-key', type='AREA')
key_data.energy = 1000          # watts
key_data.size = 1.0              # softbox size
key_data.color = (1.0, 0.95, 0.85)  # warm tungsten
key_obj = bpy.data.objects.new('LGT-key', key_data)
bpy.context.collection.objects.link(key_obj)
key_obj.location = (3, -3, 3.5)
key_obj.rotation_euler = (math.radians(35), math.radians(45), 0)

# FILL LIGHT (front-left, lower power, cool)
fill_data = bpy.data.lights.new('LGT-fill', type='AREA')
fill_data.energy = 300           # 1/3 of key
fill_data.size = 2.0              # bigger = softer
fill_data.color = (0.85, 0.9, 1.0)  # cool sky-tone
fill_obj = bpy.data.objects.new('LGT-fill', fill_data)
bpy.context.collection.objects.link(fill_obj)
fill_obj.location = (-3, -2, 2.5)
fill_obj.rotation_euler = (math.radians(50), math.radians(-45), 0)

# BACK/RIM LIGHT (behind subject, slightly above)
rim_data = bpy.data.lights.new('LGT-rim', type='SPOT')
rim_data.energy = 600
rim_data.spot_size = math.radians(40)
rim_data.color = (0.7, 0.85, 1.0)  # cooler blue rim
rim_obj = bpy.data.objects.new('LGT-rim', rim_data)
bpy.context.collection.objects.link(rim_obj)
rim_obj.location = (0, 4, 3.0)
rim_obj.rotation_euler = (math.radians(120), 0, math.radians(180))
```

**Standard ratios**:
- **High-key (commercial, fashion)** — Key:Fill = 2:1 (low contrast, flat)
- **Medium (portrait)** — Key:Fill = 4:1 (balanced)
- **Low-key (dramatic, noir)** — Key:Fill = 8:1 or higher (heavy shadows)
- **Rim** — typically 50–100% of key (just enough to separate from background)

---

## HDRI lighting (the realism trick)

An **HDRI** (High Dynamic Range Image) is a 360° photograph stored with extended brightness range. Lighting from one HDRI gives realistic ambient, reflections, and color cast — way more convincing than lights alone.

### Setup HDRI as world background
```python
import bpy

world = bpy.context.scene.world
world.use_nodes = True
nodes = world.node_tree.nodes
links = world.node_tree.links

# Clear default
for node in list(nodes):
    nodes.remove(node)

# Output node
output = nodes.new('ShaderNodeOutputWorld')
output.location = (300, 0)

# Background shader
bg = nodes.new('ShaderNodeBackground')
bg.location = (100, 0)
bg.inputs['Strength'].default_value = 1.0

# Environment Texture (HDRI)
env = nodes.new('ShaderNodeTexEnvironment')
env.location = (-100, 0)
env.image = bpy.data.images.load('/path/to/hdri.hdr')

# Mapping (rotate HDRI)
mapping = nodes.new('ShaderNodeMapping')
mapping.location = (-300, 0)
mapping.inputs['Rotation'].default_value = (0, 0, 1.5708)  # 90° Z

# Texture Coordinate (Generated for environment)
tex_coord = nodes.new('ShaderNodeTexCoord')
tex_coord.location = (-500, 0)

# Wire
links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])
links.new(mapping.outputs['Vector'], env.inputs['Vector'])
links.new(env.outputs['Color'], bg.inputs['Color'])
links.new(bg.outputs['Background'], output.inputs['Surface'])
```

**Pro source**: [Poly Haven](https://polyhaven.com/hdris) — free, CC0, professional-quality HDRIs. The category "Studio" includes pre-lit photo studio environments.

### Combine HDRI + lights
HDRI alone is often too even/flat. Standard pro combo:
- **HDRI as fill** at strength 0.3–0.5 (subtle ambient)
- **One or two key lights** for direction/shape

This is "HDRI-grounded three-point lighting" — best of both.

---

## Lighting recipes by scenario

### Studio product shot (hero render)
- HDRI: Studio HDRI from Poly Haven, strength 0.5
- Key: Area light, 1m × 1m, energy 1000W, warm
- Fill: Area light, 2m × 2m, energy 300W, neutral
- Back: Spot, energy 500W, cool blue
- World tone: dark grey (Color Management → look: Medium High Contrast)

### Sunlit outdoor
- Sun light: Strength 5, color (1.0, 0.95, 0.8) for golden hour
- HDRI: Outdoor sky HDRI at strength 1.0
- No fill light needed (HDRI provides ambient)
- Optional bounce card (white plane, low emission) for fill

### Cinematic interior (window light)
- Sun light through window: Strength 3, color cool blue (0.85, 0.9, 1.0)
- HDRI: Indoor low-light at strength 0.2
- Practical lights (lamps, candles): Point lights with warm color (1.0, 0.7, 0.4)
- World volumetrics: subtle haze (Volume Scatter)

### Dramatic / film noir
- Single Spot light, harsh angle (60° from above)
- No fill light (or very minimal, 1/8 of key)
- Cool ambient via HDRI at strength 0.1
- Fog/haze via Volume Scatter for light shafts

### Animation studio look (cartoon / stylized)
- Three-point with high contrast (Key:Fill 4:1+)
- Use Suns with hard shadows (size = 0)
- Saturated key (slightly oversaturate base color)
- Toon Shader instead of Principled BSDF for materials

---

## Shadow control

### Soft vs hard shadows
- **Soft shadows** = Area light with size > 0.5m, OR Sun with size > 0.05
- **Hard shadows** = Point light or Sun with size = 0
- **Pro rule**: hardly anything in nature has truly hard shadows. Soft shadows always look more realistic.

### Adjusting shadow blur
```python
# For Area lights, the size IS the softness
light_data.size = 1.0     # 1m × 1m area
light_data.size_y = 0.5   # for rectangular area lights

# For Sun, "angle" controls shadow softness
sun_data.angle = math.radians(0.5)  # 0.5° = realistic sun
sun_data.angle = math.radians(5)    # blurry shadows (overcast)
```

---

## Color temperature reference

| Source | Temp (K) | RGB rough |
|--------|----------|-----------|
| Candle | 1850 | (1.0, 0.6, 0.3) |
| Tungsten bulb | 3200 | (1.0, 0.85, 0.6) |
| Halogen | 3400 | (1.0, 0.9, 0.7) |
| LED warm | 3000 | (1.0, 0.8, 0.6) |
| Sunset/golden hour | 3500 | (1.0, 0.85, 0.65) |
| Daylight (noon) | 5500 | (1.0, 1.0, 1.0) |
| Overcast sky | 6500 | (0.95, 0.95, 1.0) |
| Blue hour | 8000 | (0.8, 0.9, 1.0) |
| Shade/sky | 10000 | (0.7, 0.85, 1.0) |

**Pro mix**: Key warm (3200K), fill cool (5500K) — creates the "golden/teal" Hollywood look.

---

## Common pitfalls

| Mistake | Why | Fix |
|---------|-----|-----|
| Single Sun light, no fill | Half the model is in pitch black | Add fill via Area light or HDRI |
| All lights at 1000W | Looks flat, no contrast | Use ratios: Key:Fill 4:1, Key:Rim 1:1 |
| Hard shadows only | Looks artificial | Use Area lights (Cycles) or large sun angle (EEVEE/Cycles) |
| Forgot HDRI = no reflections | Materials look matte/dull | Always set a world environment, even for indoor scenes |
| Lights inside objects | "Why is everything dark?" | Check that lights are outside geometry; visible from camera |
| Backlight too strong | Subject silhouettes lose detail | Rim should be ≤ 1× key brightness |
| Overusing volumetrics | Hazy mess; render time explodes | Volumetric Strength 0.05–0.1 max |

---

## Light Groups (Cycles 3.6+)

Render multiple lighting setups in one render via "Light Groups" — assign each light to a group, then in the compositor mix them with different intensities.

```python
import bpy

# Assign light to a Light Group
light_obj.lightgroup = 'LG-key'    # named group

# In View Layer settings:
view_layer = bpy.context.view_layer
view_layer.use_pass_combined = True
view_layer.lightgroups.add().name = 'LG-key'
view_layer.lightgroups.add().name = 'LG-fill'
view_layer.lightgroups.add().name = 'LG-rim'
```

In the compositor, each light group becomes a render pass. Mix at any ratio without re-rendering. Massive workflow speedup for look-dev.

---

## Sources

- [Three-Point Lighting with HDRI in Blender — MattePaint Academy](https://mattepaint.com/academy/tutorial/three-point-lighting-in-blender/)
- [Poly Haven — HDRIs (free, CC0)](https://polyhaven.com/hdris)
- [BlenderKit — Studio HDRI assets](https://www.blenderkit.com/asset-gallery-detail/62b625dc-59f2-4bc2-83da-d8518869cab9/)
- [Whizzy Studios — Cinematic lighting in Blender + Nuke](https://www.whizzystudios.com/post/from-concept-to-final-render-achieving-cinematic-lighting-and-composition-in-blender-and-nuke)
- [B3D Interplanety — Making your own studio HDRI](https://b3d.interplanety.org/en/making-your-own-studio-hdri-in-blender/)
- [Brandon3D — How to use HDRI in Blender 3D](https://brandon3d.com/hdri/)
- [Lightmap — HDR Light Studio Blender plugin](https://www.lightmap.co.uk/hdrlightstudio/connections/blender/)

---

## Outstanding

- [ ] Specific recipes by genre: portrait, food, jewelry, architecture
- [ ] Time-of-day presets (sunrise, noon, sunset, blue hour, night)
- [ ] Volumetric setups (god rays, fog)
- [ ] Practical lighting (matching scene reference photos)
