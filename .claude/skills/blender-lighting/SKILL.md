---
name: blender-lighting
description: Light Blender scenes professionally — three-point setups, HDRI environments, studio/cinematic/dramatic configurations, light groups, color temperature, soft vs hard shadows. Use whenever the user asks to "light the scene", "set up lighting", "make it look cinematic / dramatic / studio / outdoor / sunset", "add a key light", "use HDRI", or any lighting-related request. Make sure to use this skill even if the user does not say "light" — also covers "make it look professional", "studio shot", "moody atmosphere", "golden hour", "rim light". Pairs with blender-materials (lighting reveals materials) and blender-cameras (lighting + composition together = shot).
when_to_use: Any lighting setup or modification in Blender. Includes HDRI/environment lighting and individual lamp placement.
allowed-tools: Read Bash mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Blender Lighting

Light scenes the way pros do: with structure, intent, and physically reasonable values.

## The five light types

| Type | Behavior | Use for |
|------|----------|---------|
| **AREA** | Light from a rectangular surface; soft shadows automatic | 80% of cases. Window, softbox, fluorescent panel |
| **SUN** | Parallel rays from "infinity" | Sunlight, moonlight, distant directional |
| **POINT** | Omnidirectional from a point | Bulbs, candles, small omnis |
| **SPOT** | Cone with falloff | Stage lights, headlights, focused beams |
| **HDRI/World** | 360° environment image | Realistic ambient, outdoor, product photography |

**Default rule**: Use **Area lights** for almost everything except the sun. Soft shadows come for free.

## Decision tree

```
What's the mood?
├── Studio / commercial → Three-point lighting (key+fill+rim) + HDRI fill 0.3
├── Outdoor / sunlit → Sun + HDRI sky environment
├── Indoor cinematic → Sun through window + HDRI low + practicals (lamps as Point)
├── Dramatic / noir → Single Spot at high angle, no fill
├── Stylized / cartoon → Three-point with high contrast + saturated key color
└── Unsure → Three-point with HDRI grounding (works for 90% of cases)
```

## Reference-look handoff

If the goal is to match an original/reference image rather than make a generally attractive render, chain-load `reference-look-calibration`. It owns measurement of hue/saturation/value, object extent, glow/aura color, and before/after look metrics. This skill should then apply the requested material/lighting/render changes within that calibrated target.


## Recipes

### Helper: `aim_at(light, target)` — required for subject-aware lighting

Recipe 1 below positions lights at fixed world coords with hardcoded rotations. That's fine for a generic 1m subject at the world origin. For ANY other subject (small jewellery, tall sword, sprawling building), you need lights aimed at the subject. Use this helper:

```python
from mathutils import Vector

def aim_at(light_obj, target):
    """Aim a light at a world-space target.
    target may be a Vector or a tuple/list (x, y, z) or a Blender object.
    """
    target_pos = Vector(target.location) if hasattr(target, 'location') else Vector(target)
    direction = (target_pos - light_obj.location).normalized()
    light_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
```

### Helper: scene-aware light positioning

```python
from mathutils import Vector

def compute_scene_bbox_center(meshes):
    """Average bbox center over a list of mesh objects (world space)."""
    import bpy
    deps = bpy.context.evaluated_depsgraph_get()
    all_verts = []
    for o in meshes:
        eval_obj = o.evaluated_get(deps)
        em = eval_obj.to_mesh()
        for v in em.vertices:
            all_verts.append(o.matrix_world @ v.co)
        eval_obj.to_mesh_clear()
    xs = [v.x for v in all_verts]
    ys = [v.y for v in all_verts]
    zs = [v.z for v in all_verts]
    center = Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
    extent = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))
    return center, extent
```

### Recipe 0a — Subject-CLASS-aware three-point lighting (use this for orchestrator E2E)

Generic three-point lighting (Recipe 0b below) places lights at fixed energy ratios. That works for opaque subjects (chair, sword) but breaks for **glass** (rim washes out volume tint) and is too cool for **wood** (loses warmth).

Pass a `subject_class` hint to tune the setup:

| Class | Key:Fill:Rim ratio | Key color temp | Reason |
|-------|--------------------|----------------|--------|
| `'metal'` | 4:1:2 (default) | warm 3200K | Standard 3-point reads metallic well |
| `'glass'` | 3:1:1.2 | neutral 5500K | Soft rim — strong rim WASHES OUT volume tint; brighter fill so transmission shows colour |
| `'wood'` | 4:1:1.5 | warm 3000K | Warmer key brings out wood tones; less rim (wood doesn't need silhouette boost) |
| `'fabric'` | 3:1:0.5 | neutral 5500K | Soft and balanced; sheen reads in fill light |
| `'skin'` | 4:1:1 | warm 3500K | Warm key for healthy tone; subtle rim (avoids harsh edges on faces) |
| `'product'` | 5:1:1.5 | neutral 5000K | Higher contrast; commercial/clean look |
| (unspecified) | falls back to Recipe 0b (default) | warm 3200K | |

```python
import bpy, math
from mathutils import Vector

def aim_at(light_obj, target):
    target_pos = Vector(target.location) if hasattr(target, 'location') else Vector(target)
    direction = (target_pos - light_obj.location).normalized()
    light_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

def apply_three_point(subject_class='metal'):
    """Configure 3-point lighting with subject-class-aware ratios.

    subject_class: 'metal' | 'glass' | 'wood' | 'fabric' | 'skin' | 'product' | 'metal' (default)
    """
    profiles = {
        'metal':   dict(ratio=(4.0, 1.0, 2.0), key_color=(1.0, 0.95, 0.85), fill_color=(0.85, 0.9, 1.0), rim_color=(0.7, 0.85, 1.0)),
        'glass':   dict(ratio=(3.0, 1.0, 1.2), key_color=(1.0, 0.98, 0.95), fill_color=(0.95, 0.95, 1.0), rim_color=(0.95, 0.95, 1.0)),
        'wood':    dict(ratio=(4.0, 1.0, 1.5), key_color=(1.0, 0.92, 0.78), fill_color=(0.95, 0.95, 1.0), rim_color=(0.85, 0.92, 1.0)),
        'fabric':  dict(ratio=(3.0, 1.0, 0.5), key_color=(1.0, 0.97, 0.92), fill_color=(0.92, 0.95, 1.0), rim_color=(0.95, 0.95, 1.0)),
        'skin':    dict(ratio=(4.0, 1.0, 1.0), key_color=(1.0, 0.93, 0.82), fill_color=(0.95, 0.96, 1.0), rim_color=(0.92, 0.92, 1.0)),
        'product': dict(ratio=(5.0, 1.0, 1.5), key_color=(1.0, 0.98, 0.95), fill_color=(0.98, 0.98, 1.0), rim_color=(0.98, 0.98, 1.0)),
    }
    p = profiles.get(subject_class, profiles['metal'])

    # Compute scene bbox
    subject_meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('GEO-')]
    deps = bpy.context.evaluated_depsgraph_get()
    all_verts = []
    for o in subject_meshes:
        eo = o.evaluated_get(deps); em = eo.to_mesh()
        for v in em.vertices: all_verts.append(o.matrix_world @ v.co)
        eo.to_mesh_clear()
    xs = [v.x for v in all_verts]; ys = [v.y for v in all_verts]; zs = [v.z for v in all_verts]
    center = Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
    biggest = max(max(zs)-min(zs), max(xs)-min(xs))
    light_dist = max(biggest * 1.5, 1.0)

    # Energy scales with distance²
    base_energy = 100 * (light_dist / 1.5) ** 2
    key_e, fill_e, rim_e = (base_energy * r for r in p['ratio'])

    # Remove existing lights
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT' and (o.name.startswith('LGT-key') or o.name.startswith('LGT-fill') or o.name.startswith('LGT-rim')):
            bpy.data.objects.remove(o, do_unlink=True)

    # KEY (warm, front-right above)
    key = bpy.data.objects.new('LGT-key', bpy.data.lights.new('LGT-key', type='AREA'))
    key.data.energy = key_e; key.data.size = 0.5; key.data.color = p['key_color']
    bpy.context.collection.objects.link(key)
    key.location = (center.x + light_dist*0.7, center.y - light_dist*0.7, center.z + light_dist*0.5)
    aim_at(key, center)

    # FILL (cool, opposite, weaker)
    fill = bpy.data.objects.new('LGT-fill', bpy.data.lights.new('LGT-fill', type='AREA'))
    fill.data.energy = fill_e; fill.data.size = 1.0; fill.data.color = p['fill_color']
    bpy.context.collection.objects.link(fill)
    fill.location = (center.x - light_dist*0.7, center.y - light_dist*0.5, center.z + light_dist*0.3)
    aim_at(fill, center)

    # RIM
    rim_type = 'AREA' if subject_class == 'glass' else 'SPOT'
    rim = bpy.data.objects.new('LGT-rim', bpy.data.lights.new('LGT-rim', type=rim_type))
    rim.data.energy = rim_e; rim.data.color = p['rim_color']
    if rim_type == 'AREA':
        rim.data.size = 1.5   # larger soft-source for glass
    else:
        rim.data.spot_size = math.radians(50)
    bpy.context.collection.objects.link(rim)
    rim.location = (center.x, center.y + light_dist, center.z + light_dist*0.5)
    aim_at(rim, center)

    print(f"lighting:{subject_class} key:fill:rim={p['ratio']} dist={light_dist:.2f}m")

# Usage:
# apply_three_point('glass')   # for the wine bottle
# apply_three_point('wood')    # for the chair
# apply_three_point('metal')   # for the sword (or omit; 'metal' is default)
```

### Recipe 0b — Three-point lighting **aimed at a subject** (generic, no class hint)

Use this instead of Recipe 1 when you have a specific subject but the class doesn't matter. Lights are placed proportionally to the subject's largest dimension.

```python
import bpy, math
from mathutils import Vector

def aim_at(light_obj, target):
    target_pos = Vector(target.location) if hasattr(target, 'location') else Vector(target)
    direction = (target_pos - light_obj.location).normalized()
    light_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

# Determine subject and its scale
subject_meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('GEO-')]
deps = bpy.context.evaluated_depsgraph_get()
all_verts = []
for o in subject_meshes:
    eo = o.evaluated_get(deps); em = eo.to_mesh()
    for v in em.vertices:
        all_verts.append(o.matrix_world @ v.co)
    eo.to_mesh_clear()
xs = [v.x for v in all_verts]; ys = [v.y for v in all_verts]; zs = [v.z for v in all_verts]
center = Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
extent = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))
light_dist = max(extent * 1.5, 1.0)

# Energy values scale roughly inversely with squared distance from subject — recipe targets
# physically reasonable values for a ~1m subject at ~1.5m light distance.
key_energy = 100 * (light_dist / 1.5) ** 2
fill_energy = key_energy * 0.3
rim_energy = key_energy * 0.8

# KEY (warm, front-right above)
key = bpy.data.objects.new('LGT-key', bpy.data.lights.new('LGT-key', type='AREA'))
key.data.energy = key_energy; key.data.size = 0.5; key.data.color = (1.0, 0.95, 0.85)
bpy.context.collection.objects.link(key)
key.location = (center.x + light_dist * 0.7, center.y - light_dist * 0.7, center.z + light_dist * 0.5)
aim_at(key, center)

# FILL (cool, opposite, weaker)
fill = bpy.data.objects.new('LGT-fill', bpy.data.lights.new('LGT-fill', type='AREA'))
fill.data.energy = fill_energy; fill.data.size = 1.0; fill.data.color = (0.85, 0.9, 1.0)
bpy.context.collection.objects.link(fill)
fill.location = (center.x - light_dist * 0.7, center.y - light_dist * 0.5, center.z + light_dist * 0.3)
aim_at(fill, center)

# RIM (cool, behind, separates subject from BG)
rim = bpy.data.objects.new('LGT-rim', bpy.data.lights.new('LGT-rim', type='SPOT'))
rim.data.energy = rim_energy; rim.data.color = (0.7, 0.85, 1.0); rim.data.spot_size = math.radians(50)
bpy.context.collection.objects.link(rim)
rim.location = (center.x, center.y + light_dist, center.z + light_dist * 0.5)
aim_at(rim, center)

print(f'lighting:three_point_aimed center={tuple(round(v,2) for v in center)} extent={extent:.2f}m dist={light_dist:.2f}m')
```

### Recipe 0c — Practical lighting (scene contains its own emissive light source)

When the subject IS or CONTAINS a light source — desk lamp with bulb, candle with flame, monitor with glowing screen, neon sign — the scene needs a different setup:

1. **Make the world background dark** (Strength 0.10–0.20). Otherwise the bulb's contribution is drowned out by ambient.
2. **Reduce or remove the standard 3-point fill/rim**. The practical light should dominate.
3. **Keep a subtle ambient fill** (8-15W Area light from camera direction) so the lamp body itself is visible — pure practical-only renders make the lamp shape silhouette into shadow.
4. **Tune emission strength HIGH** for small mesh emitters (see `blender-materials` Recipe 11b — bulb spheres need Strength 800-3000 to read like real bulbs).
5. **Cycles `max_bounces` ≥ 16** for proper interior-shade lighting — the bulb's light needs to bounce inside the shade and out through the opening.

```python
import bpy
from mathutils import Vector

def aim_at(light_obj, target):
    target_pos = Vector(target.location) if hasattr(target, 'location') else Vector(target)
    direction = (target_pos - light_obj.location).normalized()
    light_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

# Dim world (let the practical dominate)
world = bpy.context.scene.world
world.use_nodes = True
nodes = world.node_tree.nodes
for n in list(nodes): nodes.remove(n)
output = nodes.new('ShaderNodeOutputWorld')
bg = nodes.new('ShaderNodeBackground')
bg.inputs['Color'].default_value = (0.02, 0.02, 0.03, 1.0)
bg.inputs['Strength'].default_value = 0.15
world.node_tree.links.new(bg.outputs['Background'], output.inputs['Surface'])

# Single subtle ambient fill from camera direction
fill = bpy.data.objects.new('LGT-ambient_fill', bpy.data.lights.new('LGT-ambient_fill', type='AREA'))
fill.data.energy = 8; fill.data.size = 1.0; fill.data.color = (0.85, 0.9, 1.0)
bpy.context.collection.objects.link(fill)
fill.location = (0.5, -0.8, 0.5)
aim_at(fill, Vector((0, 0, 0.3)))

# Cycles bounces
scene = bpy.context.scene
scene.cycles.max_bounces = 16
print('lighting:practical_setup')
```

The practical light's emission shader (mesh-emissive bulb / candle flame / etc.) handles the rest. Scene appears like real photography of an illuminated subject — dark surroundings, warm pool of light from the practical, subject silhouette gently filled.

**Validation proof**: see `text-to-blender/assets/v1.1.0-validation/desk_lamp_emission.webp` for what this setup produces (desk lamp with visible bulb glow, warm light pool on desk surface, lamp body visible against the dark scene).

### Recipe 1 — Three-point lighting (the canonical setup)

```python
import bpy, math

# KEY LIGHT (warm, front-right)
key_data = bpy.data.lights.new('LGT-key', type='AREA')
key_data.energy = 1000
key_data.size = 1.0
key_data.color = (1.0, 0.95, 0.85)  # warm tungsten ~3200K
key = bpy.data.objects.new('LGT-key', key_data)
bpy.context.collection.objects.link(key)
key.location = (3, -3, 3.5)
key.rotation_euler = (math.radians(35), math.radians(45), 0)

# FILL LIGHT (cool, front-left, weaker)
fill_data = bpy.data.lights.new('LGT-fill', type='AREA')
fill_data.energy = 300
fill_data.size = 2.0
fill_data.color = (0.85, 0.9, 1.0)  # cool sky ~6500K
fill = bpy.data.objects.new('LGT-fill', fill_data)
bpy.context.collection.objects.link(fill)
fill.location = (-3, -2, 2.5)
fill.rotation_euler = (math.radians(50), math.radians(-45), 0)

# BACK / RIM LIGHT (cool, behind subject)
rim_data = bpy.data.lights.new('LGT-rim', type='SPOT')
rim_data.energy = 600
rim_data.spot_size = math.radians(40)
rim_data.color = (0.7, 0.85, 1.0)
rim = bpy.data.objects.new('LGT-rim', rim_data)
bpy.context.collection.objects.link(rim)
rim.location = (0, 4, 3.0)
rim.rotation_euler = (math.radians(120), 0, math.radians(180))

print('lighting:three_point')
```

**Standard ratios**:
- High-key (commercial): Key:Fill = 2:1
- Medium (portrait): 4:1
- Low-key (dramatic): 8:1+
- Rim: 50–100% of key

### Recipe 2 — HDRI environment

```python
import bpy

world = bpy.context.scene.world
world.use_nodes = True
nodes = world.node_tree.nodes
links = world.node_tree.links

# Wipe existing world nodes
for n in list(nodes):
    nodes.remove(n)

# Output → Background ← Environment Texture ← Mapping ← Texture Coordinate
output = nodes.new('ShaderNodeOutputWorld'); output.location = (300, 0)
bg = nodes.new('ShaderNodeBackground'); bg.location = (100, 0)
bg.inputs['Strength'].default_value = 1.0

env = nodes.new('ShaderNodeTexEnvironment'); env.location = (-100, 0)
env.image = bpy.data.images.load('/path/to/your.hdr')   # ← user provides path

mapping = nodes.new('ShaderNodeMapping'); mapping.location = (-300, 0)
tex_coord = nodes.new('ShaderNodeTexCoord'); tex_coord.location = (-500, 0)

links.new(tex_coord.outputs['Generated'], mapping.inputs['Vector'])
links.new(mapping.outputs['Vector'], env.inputs['Vector'])
links.new(env.outputs['Color'], bg.inputs['Color'])
links.new(bg.outputs['Background'], output.inputs['Surface'])
print('lighting:hdri')
```

**Pro source**: free HDRIs at [polyhaven.com/hdris](https://polyhaven.com/hdris) (CC0).

### Recipe 3 — Sunny outdoor

```python
import bpy, math

sun_data = bpy.data.lights.new('LGT-sun', type='SUN')
sun_data.energy = 5.0
sun_data.color = (1.0, 0.95, 0.8)  # golden hour
sun_data.angle = math.radians(0.5)  # realistic sun size; bigger = softer
sun = bpy.data.objects.new('LGT-sun', sun_data)
bpy.context.collection.objects.link(sun)
sun.location = (0, 0, 10)
sun.rotation_euler = (math.radians(45), math.radians(15), 0)
print('lighting:outdoor_sun')
```

Combine with HDRI sky environment (Recipe 2) for natural ambient fill.

### Recipe 4 — Indoor window light

```python
import bpy, math

# Sun coming through window — cool blue, sharp
sun_data = bpy.data.lights.new('LGT-window_sun', type='SUN')
sun_data.energy = 3.0
sun_data.color = (0.85, 0.9, 1.0)
sun_data.angle = math.radians(2.0)  # softer than direct sun
sun = bpy.data.objects.new('LGT-window_sun', sun_data)
bpy.context.collection.objects.link(sun)
sun.location = (5, -3, 4)
sun.rotation_euler = (math.radians(60), math.radians(-30), 0)

# Practical lamp — warm point light
lamp_data = bpy.data.lights.new('LGT-lamp', type='POINT')
lamp_data.energy = 60
lamp_data.color = (1.0, 0.7, 0.4)  # warm bulb
lamp = bpy.data.objects.new('LGT-lamp', lamp_data)
bpy.context.collection.objects.link(lamp)
lamp.location = (-1, 2, 1.5)
print('lighting:indoor_window')
```

### Recipe 5 — Dramatic single-source

```python
import bpy, math

spot_data = bpy.data.lights.new('LGT-drama', type='SPOT')
spot_data.energy = 800
spot_data.spot_size = math.radians(30)
spot_data.spot_blend = 0.3
spot_data.color = (1.0, 0.95, 0.85)
spot = bpy.data.objects.new('LGT-drama', spot_data)
bpy.context.collection.objects.link(spot)
spot.location = (2, -2, 6)
spot.rotation_euler = (math.radians(60), 0, 0)
print('lighting:dramatic')
```

For full noir: pair with strong volumetrics (atmosphere) — see `references/overview.md` for the volumetric setup.

### Recipe 6 — Color-temperature cheat sheet

| Source | RGB |
|--------|-----|
| Candle (1850K) | `(1.0, 0.6, 0.3)` |
| Tungsten (3200K) | `(1.0, 0.85, 0.6)` |
| LED warm (3000K) | `(1.0, 0.8, 0.6)` |
| Sunset / golden (3500K) | `(1.0, 0.85, 0.65)` |
| Daylight noon (5500K) | `(1.0, 1.0, 1.0)` |
| Overcast sky (6500K) | `(0.95, 0.95, 1.0)` |
| Blue hour (8000K) | `(0.8, 0.9, 1.0)` |

**Pro mix**: Warm key (tungsten) + cool fill (daylight) = the "golden/teal" Hollywood look.

### Recipe 7 — Soft vs hard shadow tweak

```python
import bpy, math

light_data = bpy.data.lights['LGT-key']

# Make shadows softer
light_data.size = 2.0     # Area: bigger size = softer shadow
# Or for Sun:
# light_data.angle = math.radians(5)  # bigger angle = softer shadow

# Make shadows harder (crisp)
# light_data.size = 0.1
# Or:
# light_data.angle = math.radians(0.5)
```

## Naming convention

| Prefix | Meaning |
|--------|---------|
| `LGT-key` | Main / key light |
| `LGT-fill` | Fill light |
| `LGT-rim` / `LGT-back` | Rim or back light |
| `LGT-sun` | Sun lamp |
| `LGT-{name}` | Practical lights (lamp, candle, neon, etc.) |

## Common pitfalls

| Symptom | Fix |
|---------|-----|
| Half the model in pitch black | Add fill (Area light or HDRI) |
| Render looks "flat" | Increase key:fill ratio; add rim |
| Hard shadows everywhere | Increase Area size or Sun angle |
| Too dark overall | Boost View Transform exposure or HDRI strength |
| No reflections on materials | Always set a world environment (HDRI) |
| Light inside object | Check world position; light must be visible from camera |
| Backlight blowing out subject | Rim energy ≤ key energy |

## When to load `references/overview.md`

Load when:
- The user asks for a setup not in the recipes (volumetric god rays, light groups, light linking)
- HDRI rotation / strength tuning is needed beyond defaults
- Multi-light scenes (5+ lamps) require organization
- Color science or color management gets specific (AgX, Filmic)

The reference covers: all 5 light types in depth, full HDRI workflow, light groups for re-lighting in compositor, recipes for product/portrait/architectural/character/animation looks.
