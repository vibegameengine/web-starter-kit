# Cameras + Composition — Pro Knowledge Overview

**Domain**: 08 — Cameras, framing, depth of field, cinematic look  
**Status**: Initial pass complete  
**Last update**: 2026-04-27

---

## Camera fundamentals (in 30 seconds)

A camera in Blender mimics a real DSLR/cinema camera:
- **Focal length** (mm) — how zoomed-in. Lower = wider angle, higher = more zoom.
- **Sensor size** — defaults to 35mm. Affects field of view.
- **Aperture** (f-stop) — controls Depth of Field. Lower f = blurrier background.
- **Focus distance / object** — what's tack-sharp.

**Rule**: focal length and sensor size together define field-of-view (FOV). For matching real-world cameras, use 35mm sensor as the baseline.

---

## Focal length cheat sheet (matches real-world lens use)

| Focal length | Field of view | Use case | Cinematic feel |
|-------------|---------------|----------|----------------|
| **14–24mm** | Very wide (~94–84°) | Architecture, landscapes, claustrophobic interiors | Distorted, exaggerated perspective |
| **28–35mm** | Wide (~74–63°) | Environment establishing shots, group scenes | Natural-wide, "documentary" |
| **50mm** | Normal (~46°) | Mimics human eye perspective | Neutral, "cinematic standard" |
| **85mm** | Short telephoto (~24°) | Portraits, character close-ups | Flattering, separation from background |
| **100–135mm** | Telephoto (~12–18°) | Hero product shots, isolated subjects | Compressed background, glamour |
| **200mm+** | Long telephoto (~6° or less) | Wildlife, surveillance look | Heavy compression, very shallow DoF |

**Quick rule of thumb**:
- **Want intimacy?** 85mm.
- **Want spectacle?** 24mm.
- **Want neutral storytelling?** 50mm.
- **Want product hero?** 100mm + shallow DoF.

---

## Setting up a camera in Python

```python
import bpy
import math

# Create camera
cam_data = bpy.data.cameras.new('Camera')
cam_obj = bpy.data.objects.new('Camera', cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj   # set as active scene camera

# Position
cam_obj.location = (3.0, -5.0, 1.6)   # right, back, eye-level
cam_obj.rotation_euler = (math.radians(85), 0, math.radians(30))

# Lens
cam_data.lens = 85          # mm focal length
cam_data.sensor_width = 36  # full-frame DSLR sensor
cam_data.clip_start = 0.01
cam_data.clip_end = 1000

# Depth of field
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.8         # shallow DoF
cam_data.dof.focus_object = bpy.data.objects['GEO-subject']  # tracks the object
# OR use focus distance:
# cam_data.dof.focus_distance = 5.0
```

---

## Aperture / f-stop quick reference

| f-stop | DoF | Use |
|--------|-----|-----|
| **f/1.2** | Razor thin | Macro, dreamy hero portraits |
| **f/2.0** | Very shallow | Product hero, character close-up |
| **f/2.8** | Shallow | Standard portrait DoF |
| **f/4.0** | Moderate | Two characters in frame, both sharp |
| **f/5.6** | Medium | Group portraits, environment with foreground subject |
| **f/8.0** | Deep | Landscape, "everything sharp" |
| **f/16+** | Very deep | Architectural, technical photography |

**Visual rule**: every halving of f-number doubles DoF blur intensity. f/1.4 is twice as blurry as f/2.8.

---

## Composition rules (the 5 to actually know)

### 1. Rule of Thirds
Divide frame into 3×3. Place subject on one of the 4 intersection points (not the center).

```python
# Enable rule-of-thirds overlay in Blender
cam_data.show_composition_thirds = True
```

### 2. Leading lines
Use roads, walls, edges, light beams to guide the eye to the subject.

### 3. Headroom + nose room
For characters: leave breathing room above the head; if facing left, leave space on the left for them to "look into."

### 4. Foreground / midground / background separation
Three depth layers create dimensionality. Add foreground elements (out-of-focus leaves, dust) for cinematic feel.

### 5. 180° rule (for animation/multi-shot)
Maintain consistent screen direction across cuts. If character A is on the left looking right at character B in shot 1, keep A on the left in shot 2.

---

## Built-in composition guides

```python
import bpy
cam_data = bpy.data.cameras['Camera']

# Toggle composition overlays in viewport
cam_data.show_composition_thirds = True       # Rule of thirds
cam_data.show_composition_golden = True       # Golden ratio (1.618)
cam_data.show_composition_golden_tria_a = True  # Diagonal triangles
cam_data.show_composition_center = True       # Center cross
cam_data.show_composition_center_diagonal = True  # X across frame
```

These render in viewport only; do not appear in final render.

---

## Hero shot recipe (product / portrait)

```python
import bpy, math

subject = bpy.data.objects['GEO-subject']

# Camera 4m back, slightly above subject's center
cam_data = bpy.data.cameras.new('Camera_Hero')
cam_obj = bpy.data.objects.new('Camera_Hero', cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

cam_obj.location = (subject.location.x, subject.location.y - 4, subject.location.z + 0.3)
cam_obj.rotation_euler = (math.radians(85), 0, 0)

# 85mm portrait lens
cam_data.lens = 85
cam_data.sensor_width = 36

# Track subject (auto-aim)
constraint = cam_obj.constraints.new('TRACK_TO')
constraint.target = subject
constraint.track_axis = 'TRACK_NEGATIVE_Z'
constraint.up_axis = 'UP_Y'

# Shallow DoF
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.8
cam_data.dof.focus_object = subject
```

---

## Animated camera (orbit, dolly, push-in)

### Orbit around object
```python
import bpy, math

target = bpy.data.objects['GEO-subject']

# Empty as pivot
pivot = bpy.data.objects.new('Camera_Pivot', None)
pivot.location = target.location
bpy.context.collection.objects.link(pivot)

# Camera child of pivot
cam_data = bpy.data.cameras.new('Camera_Orbit')
cam_obj = bpy.data.objects.new('Camera_Orbit', cam_data)
bpy.context.collection.objects.link(cam_obj)
cam_obj.parent = pivot
cam_obj.location = (0, -5, 0.5)  # offset from pivot
cam_obj.rotation_euler = (math.radians(85), 0, 0)

# Animate the pivot's Z rotation
pivot.rotation_euler = (0, 0, 0)
pivot.keyframe_insert('rotation_euler', frame=1)
pivot.rotation_euler = (0, 0, math.radians(360))
pivot.keyframe_insert('rotation_euler', frame=240)   # 240 frames at 24fps = 10s
```

### Dolly (camera moves linearly)
Just keyframe `cam_obj.location` between two points.

### Push-in (zoom by physical movement, not focal length)
Move the camera forward while keeping focal length constant. Visually distinct from a zoom (less unnatural).

---

## Sensor size and crop factors

| Sensor | Width | Notes |
|--------|-------|-------|
| **Full frame** | 36mm | Default Blender; matches 35mm cinema and FX DSLR |
| **APS-C** | 22.5mm | Cropped DSLR (1.5–1.6× crop factor) |
| **Super 35** | 24.89mm | Most cinema cameras |
| **Micro Four Thirds** | 17.3mm | Smaller mirrorless |
| **iPhone 15 Pro** | 9.8mm | Smartphone reference |

To match a smartphone/cinema lens look in Blender, set `sensor_width` accordingly.

---

## Cinematic effects

### Anamorphic look
- Sensor 18.66mm × wide focal length → cinemascope ratio
- Or use a render aspect of 2.39:1 (e.g., 2560×1080)
- Blender 4.x has anamorphic blur option

### Lens flares
- Compositing pass (post-process) — Glare node with "Streaks" type
- Or 3D-modeled flare element + add light

### Vignette (darken edges)
- Compositor: render output → Lens Distortion + Color Balance darken edges → Composite

### Film grain
- Compositor: Add Texture Noise → Mix with render via Add (low strength, e.g., 0.05)

---

## Common pitfalls

| Mistake | Fix |
|---------|-----|
| Wide lens for portrait → distorted face | Use 50mm+ for human subjects |
| f/1.4 with focus on background → subject blurred | Set focus to subject explicitly via `focus_object` |
| Camera dead-center on subject → boring | Apply rule-of-thirds; subject at intersection |
| Orbit camera tilts wildly | Use Track To constraint instead of manual rotation |
| Sky too dominant in landscape | Drop horizon to lower third, sky upper two-thirds |
| Camera below ground in animation | Use Floor constraint or check Z keyframes |
| DoF computes slowly in Cycles | Enable in viewport only; bake or denoise for finals |

---

## Sources

- [Cameras — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/render/cameras.html)
- [Blended Boris — Camera settings: focal length & DoF](https://blendedboris.com/our-blog/tpost/camera-settings-in-blender)
- [CG Cookie — Improving Blender 3D renders: tips and tricks](https://cgcookie.com/posts/improving-your-blender-3d-renders-tips-and-tricks)
- [LensViewing — Blender camera angle of view (Feb 2026)](https://lensviewing.com/blender-camera-angle-of-view/)
- [Blender Base Camp — Camera Work: Composition Tips](https://www.blenderbasecamp.com/blender-camera-work-composition-tips/)
- [Yelzkizi — Best camera settings for rendering](https://yelzkizi.org/best-camera-settings-in-blender-for-rendering/)

---

## Outstanding

- [ ] Multi-camera scene markers (cinematic editing)
- [ ] Camera shake noise modifiers
- [ ] Stereo / VR camera setup
- [ ] Match-move and tracking workflow
