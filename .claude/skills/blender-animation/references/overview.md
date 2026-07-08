# Animation — Pro Knowledge Overview

**Domain**: 09 — Keyframes, F-curves, NLA, drivers, shape keys  
**Status**: Initial pass complete  
**Last update**: 2026-04-27

---

## The four animation systems

| System | What it animates | Use for |
|--------|-----------------|---------|
| **Keyframe animation** | Any property | Bread-and-butter (object motion, camera, light intensity) |
| **F-curves** | Interpolation between keyframes | Easing, smooth motion, fine-tuning |
| **NLA (Non-Linear Animation)** | Action clips, layers | Reusable animations, blending walks/runs |
| **Drivers** | Property = expression of another | Mechanical relations, corrective shapes |
| **Shape keys** | Mesh deformation targets | Facial expressions, morphing, blend shapes |

A pro uses **all** of these together — keyframes for primary motion, drivers for secondary, shape keys for face, NLA for layered/loopable systems.

---

## Keyframes (the foundation)

```python
import bpy

obj = bpy.data.objects['GEO-character']

# Set frame, then set property, then keyframe
bpy.context.scene.frame_set(1)
obj.location = (0, 0, 0)
obj.keyframe_insert(data_path='location', frame=1)

bpy.context.scene.frame_set(60)
obj.location = (5, 0, 0)
obj.keyframe_insert(data_path='location', frame=60)

# Or directly insert at specific frame
obj.location = (0, 0, 2)
obj.keyframe_insert(data_path='location', frame=120, index=2)  # only Z axis
```

**Common animatable data paths**:
- `location` — XYZ position
- `rotation_euler` — XYZ rotation (or `rotation_quaternion` for quaternions)
- `scale` — XYZ scale
- `data.lens` — camera focal length
- `data.energy` — light power
- `["custom_property"]` — animatable custom properties
- `pose.bones["Bone"].location` — bone position in pose mode
- `data.shape_keys.key_blocks["Smile"].value` — shape key value

---

## The Graph Editor (F-Curve manipulation)

After setting keyframes, you control the *shape of the motion* in the Graph Editor (F-curves):
- **X axis** = time (frames)
- **Y axis** = property value
- **Curve between keyframes** = interpolation

### Interpolation modes
| Mode | Behavior | Use |
|------|----------|-----|
| **Bezier** (default) | Smooth S-curve | Natural motion |
| **Linear** | Constant velocity | Mechanical motion |
| **Constant** | Step (no interpolation) | Hold pose / discrete states |
| **Sine, Quad, Cubic, Quart, Quint** | Various curve shapes | Stylized easing |
| **Bounce, Elastic, Back** | Physics-like overshoots | Cartoon / stylized motion |

### Easing modes
For non-Bezier interpolation, choose easing:
- **Ease In** — slow start, fast end
- **Ease Out** — fast start, slow end
- **Ease In Out** — slow at both ends, fast in middle
- **Auto Easing** — Blender chooses based on curve shape

```python
# Set keyframe interpolation programmatically
import bpy

action = bpy.data.actions['CharAction']
fcurve = action.fcurves.find('location', index=0)  # X-axis
for kf in fcurve.keyframe_points:
    kf.interpolation = 'BEZIER'
    kf.handle_left_type = 'AUTO_CLAMPED'
    kf.handle_right_type = 'AUTO_CLAMPED'
```

### Pro animation principles
- **Slow in, slow out** — Bezier interpolation does this automatically; reinforces real-world physics
- **Anticipation** — small reverse motion before the big move (jump prep, attack windup)
- **Follow-through** — secondary parts continue after main motion stops (hair, cloth, springs)
- **Squash and stretch** — exaggeration; use shape keys or scale animation
- **Arcs** — natural motion follows curves, not straight lines

---

## NLA Editor (Non-Linear Animation)

Group keyframe sequences into reusable **Actions**, then layer/blend them in the NLA Editor.

**Standard NLA workflow**:
1. Animate something in the timeline → automatic Action created in current scene.
2. **Push down to NLA**: timeline action becomes a strip in the NLA editor.
3. **Repeat / scale / blend** the strip without modifying source action.
4. **Stack multiple strips** (e.g., Walk action + Wave action played simultaneously on different bones).
5. **Tweak mode**: enter a strip to edit while seeing its NLA context.

**Pro pattern**: Build an animation library (`Walk`, `Run`, `Idle`, `Jump`) as actions. Use NLA to sequence them: Idle → Walk for 3s → Run for 2s → Jump → Idle.

```python
import bpy

obj = bpy.data.objects['GEO-character']

# Add an animation data block if not present
if not obj.animation_data:
    obj.animation_data_create()

# Push current action to NLA
if obj.animation_data.action:
    track = obj.animation_data.nla_tracks.new()
    track.name = 'NLA-Walk'
    strip = track.strips.new('Walk', start=1, action=obj.animation_data.action)
    strip.frame_end = 60
    obj.animation_data.action = None    # Clear timeline; NLA takes over
```

---

## Drivers (Python-driven property values)

A driver sets one property = function of others. Animator never touches it; it animates automatically.

**Classic uses**:
- **Eye look-at**: bone rotation = function of empty position (eye target)
- **Door rotation**: opens when character is within distance
- **Corrective shape key**: shape engages when bone exceeds rotation threshold
- **Wheel spin**: wheel rotation = vehicle distance / wheel circumference

```python
import bpy

# Add driver to object's location.x = function of empty's location.x × 2
obj = bpy.data.objects['GEO-target']
empty = bpy.data.objects['Empty-source']

fcurve = obj.driver_add('location', 0)  # X axis
driver = fcurve.driver
driver.type = 'SCRIPTED'

# Variable: source empty's X position
var = driver.variables.new()
var.name = 'src_x'
var.type = 'TRANSFORMS'
var.targets[0].id = empty
var.targets[0].transform_type = 'LOC_X'
var.targets[0].transform_space = 'WORLD_SPACE'

# Expression
driver.expression = 'src_x * 2'
```

**Driver types**:
- `'SCRIPTED'` — Python expression (most flexible)
- `'AVERAGE'` — average of variables
- `'SUM'` — sum of variables
- `'MIN'`, `'MAX'` — min/max of variables

**Pro tip**: Drivers are evaluated every frame. Heavy expressions slow viewport. Profile if you have hundreds.

---

## Shape Keys (blendshapes / morph targets)

Mesh deformation between defined poses. Used heavily for facial animation, lip sync, hand poses.

```python
import bpy

obj = bpy.data.objects['GEO-character_face']

# Add basis (rest pose) shape key
basis = obj.shape_key_add(name='Basis')

# Add a morph target
smile = obj.shape_key_add(name='Smile')
smile.value = 0.0

# Now in Edit Mode, modify mesh while 'Smile' is selected.
# When you exit Edit Mode, the difference from Basis is stored.

# Animate the shape key
smile.value = 0.0
smile.keyframe_insert('value', frame=1)
smile.value = 1.0
smile.keyframe_insert('value', frame=24)
```

**Standard facial shape key library** (visemes for lip sync):
- Mouth shapes: `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_sil`
- Expressions: `mouthSmile`, `browFurrow`, `eyeBlink`, `cheekRaise`
- Total: 52 ARKit blendshapes is a common standard (covers face entirely)

**glTF export**: shape keys export as `morph targets` automatically. Required for face-driven 3D characters in web/AR/VR.

---

## Animation playback and rendering

### Frame range
```python
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 240   # 10 seconds at 24 fps
scene.frame_current = 1
scene.render.fps = 24    # 24, 30, 60, 120 typical
```

### Render animation
```python
# Render to file sequence (preferred — resilient to crashes)
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '/tmp/anim_'

bpy.ops.render.render(animation=True)
# Outputs anim_0001.png, anim_0002.png, ...

# Combine with ffmpeg afterwards
# ffmpeg -framerate 24 -i anim_%04d.png -c:v libx264 -pix_fmt yuv420p anim.mp4
```

### Real-time preview (OpenGL render)
```python
# Faster than full render; for previz
bpy.ops.render.opengl(animation=True)
```

---

## Common pitfalls

| Mistake | Why | Fix |
|---------|-----|-----|
| Linear interpolation everywhere | Robot-like motion | Bezier with auto handles |
| Keyframes on every frame | Choppy, hard to edit | Sparse keyframes; use F-curves to control between |
| No anticipation/follow-through | Stiff movement | Add small counter-poses before/after main keys |
| Animating `rotation_euler` past 180° | Gimbal flip | Use `rotation_quaternion` or break into multiple keys |
| Rendering as MP4 directly | Crash = lose all frames | Render to PNG sequence, encode after |
| Frame rate mismatch (animated 60fps, exported 24fps) | Janky playback | Set `scene.render.fps` first, then animate |
| Shape key modifications without exiting Edit Mode | "Why isn't my shape key saving?" | Must exit Edit Mode to commit shape key state |

---

## Sources

- [Editing F-Curves — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/editors/graph_editor/fcurves/editing.html)
- [Wikibooks — Introducing the Graph Editor](https://en.wikibooks.org/wiki/Blender_3D:_Noob_to_Pro/Basic_Animation/Introducing_the_Graph_Editor)
- [GraphPilot — Easing addon (Superhive)](https://superhivemarket.com/products/graphpilot)
- [Toxigon — Mastering Keyframe Animation](https://toxigon.com/mastering-keyframe-animation-in-blender)
- [Math/HWS — Computer Graphics: Blender Animation](https://math.hws.edu/graphicsbook/a2/s3.html)
- [Yelzkizi — How to Animate in Blender](https://yelzkizi.org/how-to-animate-in-blender/)

---

## Outstanding

- [ ] Action constraints (animation triggered by transform thresholds)
- [ ] Motion paths visualization
- [ ] Mocap import/cleanup
- [ ] Rigify-specific animation (IK/FK switch baking)
- [ ] Specific recipes: walk cycle, idle breath, attack swing
