---
name: blender-animation
description: Animate objects, cameras, lights, and properties in Blender — keyframes, F-curves, easing (Bezier, Linear, Sine, Bounce, Elastic), shape keys (morph targets / blendshapes / visemes), drivers (Python expressions on properties), NLA actions for reuse and layering. Use whenever the user asks to "animate this", "make it move / rotate / scale over time", "add keyframes", "loop / oscillate", "shape key / morph / blendshape", "visemes for lip sync", or any time-based property change. Make sure to use this skill even if the user does not say "animate" — also covers "spin it slowly", "make it wave", "fade in / out", "pulse", "facial expression".
when_to_use: Any time-based animation, keyframe insertion, F-curve manipulation, shape-key editing, or driver setup in Blender.
allowed-tools: Read Bash mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Blender Animation

Animate properties over time. Most animation is just keyframes — the trick is choosing the right interpolation and easing for the motion's character.

## Decision tree

```
What kind of motion?
├── Object movement (translate / rotate / scale)
│   → Keyframe `location` / `rotation_euler` / `scale`
│   → Recipe 1, 2
│
├── Mechanical / constant speed (gears, conveyor belts, scrolling)
│   → Linear interpolation
│   → Recipe 3
│
├── Natural / organic (most things)
│   → Bezier interpolation with auto handles
│   → Recipe 1
│
├── Cartoon / stylized (overshoot, bounce, anticipation)
│   → Bounce / Elastic / Back easing
│   → Recipe 4
│
├── Facial / morph / blendshape
│   → Shape Keys, animate `value` property
│   → Recipe 5
│
├── Mechanical relations (one property = function of another)
│   → Drivers (Python expression)
│   → Recipe 6
│
└── Reusable / layered animations
    → NLA actions
    → Recipe 7
```

## Recipes

### Recipe 1 — Animate object position (Bezier, natural)

```python
import bpy

obj = bpy.data.objects['GEO-target']

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 60
scene.render.fps = 24

# Keyframe 1: at frame 1, at origin
scene.frame_set(1)
obj.location = (0, 0, 0)
obj.keyframe_insert('location', frame=1)

# Keyframe 2: at frame 60, moved to (5, 0, 0)
scene.frame_set(60)
obj.location = (5, 0, 0)
obj.keyframe_insert('location', frame=60)

print(f"animated:{obj.name} 1->60")
```

Default interpolation = Bezier (smooth in/out). To make it linear, see Recipe 3.

### Recipe 2 — Animate rotation (a 360° spin)

```python
import bpy, math

obj = bpy.data.objects['GEO-target']
scene = bpy.context.scene

# Use rotation_euler with a single axis.
# WARNING: animating past 180° on Euler can flip; use multiple keyframes or quaternions for full rotations.

scene.frame_set(1)
obj.rotation_euler = (0, 0, 0)
obj.keyframe_insert('rotation_euler', frame=1)

scene.frame_set(120)
obj.rotation_euler = (0, 0, math.radians(180))   # half-turn
obj.keyframe_insert('rotation_euler', frame=120)

scene.frame_set(240)
obj.rotation_euler = (0, 0, math.radians(360))   # full turn
obj.keyframe_insert('rotation_euler', frame=240)

print(f"rotated:{obj.name} 360 over 240 frames")
```

For perfectly constant spin, set keyframes to Linear interpolation (Recipe 3).

### Recipe 3 — Set keyframes to Linear interpolation

⚠ **Blender 5.x changed the Action API.** Legacy `action.fcurves` was removed in favour of layered Actions: `action.layers[].strips[].channelbags[].fcurves`. Use this compat helper.

```python
import bpy

def get_fcurves_compat(action):
    """Return all fcurves on an Action — works on both legacy (≤4.x) and layered (5.x+) actions."""
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    fcurves = []
    for layer in action.layers:
        for strip in layer.strips:
            if hasattr(strip, 'channelbags'):
                for cb in strip.channelbags:
                    fcurves.extend(cb.fcurves)
    return fcurves

obj = bpy.data.objects['GEO-target']
if obj.animation_data and obj.animation_data.action:
    for fc in get_fcurves_compat(obj.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
print(f"interp:linear {obj.name}")
```

Other options: `'BEZIER'` (default), `'CONSTANT'` (step), `'SINE'`, `'QUAD'`, `'CUBIC'`, `'QUART'`, `'QUINT'`, `'BOUNCE'`, `'ELASTIC'`, `'BACK'`.

### Recipe 4 — Bouncy / cartoon easing on a specific keyframe

```python
import bpy

# (Re-use get_fcurves_compat from Recipe 3.)
def get_fcurves_compat(action):
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    fcurves = []
    for layer in action.layers:
        for strip in layer.strips:
            if hasattr(strip, 'channelbags'):
                for cb in strip.channelbags:
                    fcurves.extend(cb.fcurves)
    return fcurves

obj = bpy.data.objects['GEO-target']
target_fc = None
for fc in get_fcurves_compat(obj.animation_data.action):
    if fc.data_path == 'location' and fc.array_index == 2:   # Z axis
        target_fc = fc
        break

if target_fc and len(target_fc.keyframe_points) >= 2:
    last_kp = target_fc.keyframe_points[-1]
    last_kp.interpolation = 'BOUNCE'
    last_kp.easing = 'EASE_OUT'    # 'AUTO', 'EASE_IN', 'EASE_OUT', 'EASE_IN_OUT'
print('animated:bouncy_landing')
```

### Recipe 5 — Shape keys (morph / blendshape / viseme)

```python
import bpy

mesh_obj = bpy.data.objects['GEO-character_face']

# Add basis (the rest pose)
if mesh_obj.data.shape_keys is None:
    basis = mesh_obj.shape_key_add(name='Basis')

# Add a morph target
smile = mesh_obj.shape_key_add(name='Smile')
smile.value = 0.0
# ⚠ At this point, switch to Edit Mode interactively and modify the mesh while 'Smile' is selected.
#   Or set vertex coordinates programmatically (advanced).

# Animate
scene = bpy.context.scene
scene.frame_set(1)
smile.value = 0.0
smile.keyframe_insert('value', frame=1)

scene.frame_set(24)
smile.value = 1.0
smile.keyframe_insert('value', frame=24)

print('animated:shape_key_smile')
```

**For lip sync**: standard 15-viseme set (Oculus / ARKit) — name shape keys `viseme_aa`, `viseme_E`, `viseme_O`, etc. Animate each viseme's value across the audio timeline.

### Recipe 6 — Driver (one property as expression of another)

```python
import bpy

# Example: child object's X = parent's X × 2
target = bpy.data.objects['GEO-follower']
source = bpy.data.objects['GEO-leader']

fc = target.driver_add('location', 0)   # X axis
driver = fc.driver
driver.type = 'SCRIPTED'

# Add variable referencing source's X position
var = driver.variables.new()
var.name = 'src_x'
var.type = 'TRANSFORMS'
var.targets[0].id = source
var.targets[0].transform_type = 'LOC_X'
var.targets[0].transform_space = 'WORLD_SPACE'

driver.expression = 'src_x * 2'
print(f"driver:{target.name}.x = {source.name}.x * 2")
```

### Recipe 7 — Push current animation to NLA strip (for reuse)

```python
import bpy

obj = bpy.data.objects['GEO-character']

if obj.animation_data and obj.animation_data.action:
    track = obj.animation_data.nla_tracks.new()
    track.name = 'NLA-Walk'
    strip = track.strips.new('Walk', start=1, action=obj.animation_data.action)
    obj.animation_data.action = None    # clear timeline; NLA owns the animation
    print(f"nla:pushed_walk_strip")
```

After this, the animation is reusable — duplicate the strip, scale time, blend with other tracks.

### Recipe 8 — Subtle idle animation (loopable rotation)

```python
import bpy, math

obj = bpy.data.objects['GEO-target']

# Tiny sway around Y, 4-second loop
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 96    # 4s at 24fps

scene.frame_set(1)
obj.rotation_euler = (0, math.radians(-2), 0)
obj.keyframe_insert('rotation_euler', frame=1)

scene.frame_set(48)
obj.rotation_euler = (0, math.radians(2), 0)
obj.keyframe_insert('rotation_euler', frame=48)

scene.frame_set(96)
obj.rotation_euler = (0, math.radians(-2), 0)
obj.keyframe_insert('rotation_euler', frame=96)

# Set extrapolation mode to cycle (loop)
def get_fcurves_compat(action):
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    fcurves = []
    for layer in action.layers:
        for strip in layer.strips:
            if hasattr(strip, 'channelbags'):
                for cb in strip.channelbags:
                    fcurves.extend(cb.fcurves)
    return fcurves

if obj.animation_data and obj.animation_data.action:
    for fc in get_fcurves_compat(obj.animation_data.action):
        fc.modifiers.new('CYCLES')
print('animated:idle_loop')
```

## Pro animation principles

- **Slow in, slow out** — Bezier handles do this automatically; matches real-world physics
- **Anticipation** — small reverse motion before the main action (jump prep)
- **Follow-through** — secondary parts continue after main motion stops (cape, hair)
- **Squash & stretch** — exaggeration with shape keys or scale animation
- **Arcs** — natural motion follows curves, not straight lines

## Common pitfalls

| Symptom | Fix |
|---------|-----|
| Robotic motion | Default Bezier is correct; Linear is wrong for organic things |
| Rotation flips at 180° | Use multiple keyframes (90, 180, 270, 360) or quaternions |
| Shape key changes lost | Must exit Edit Mode to commit shape key state |
| Animation only on one axis | `keyframe_insert('location', index=0)` for X only; index=1 Y, =2 Z |
| Driver doesn't update | Refresh viewport; check Preferences → Editing → Allow Driver Python Expression |
| Render fps mismatch | Set `scene.render.fps` BEFORE animating to avoid timing drift |

## When to load `references/overview.md`

Load when:
- Animation curves need fine tuning (handle types, bezier shape control)
- NLA layering / blending needed
- Drivers with complex expressions (multi-variable, conditional)
- ARKit 52-blendshape full face animation
- Walk-cycle / run-cycle / attack patterns

The reference covers: full F-curve interpolation/easing matrix, NLA workflow, drivers cookbook, shape-key best practices, animation principles.
