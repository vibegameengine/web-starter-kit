# Import / Export — Pro Knowledge Overview

**Domain**: 14 — glTF, FBX, OBJ, USD, STL, optimization for target platform  
**Status**: Initial pass complete  
**Last update**: 2026-04-27

---

## Decision tree — which format for which target?

```
Where is this asset going?
├── Game engine (Unity, Unreal, Godot)
│   ├── Animated/rigged → FBX
│   ├── Static/mesh-only → OBJ or FBX
│   └── Modern engines → glTF (increasingly preferred)
│
├── Web (Three.js, Babylon.js, A-Frame, model-viewer)
│   └── glTF / GLB (only sensible choice)
│
├── AR (USDZ for Apple, glTF for Android)
│   └── USDZ (iOS) or glTF (Android)
│
├── 3D Printing
│   └── STL (geometry only, watertight required)
│
├── VFX pipeline (Maya, Houdini, Nuke, USD-based)
│   └── USD (Universal Scene Description)
│
├── DCC tool roundtrip
│   └── FBX (industry standard) or .blend (best for Blender↔Blender)
│
└── Unsure / generic
    └── glTF (open spec, modern, well-supported)
```

---

## glTF / GLB — the modern web/AR standard

**Already covered in detail** in `wireframe-to-3d/references/best-practices.md`. Quick reminders:

- **GLB** = single binary file (preferred); **glTF** = JSON + .bin + textures (debug-friendly).
- **Material support**: only Principled BSDF exports cleanly. Procedural shaders must be baked.
- **Hard cap**: 15 MB; soft target 8 MB.
- **No KTX2** unless you load extra Three.js KTX2Loader; no Draco unless you load DRACOLoader.

```python
import bpy

bpy.ops.export_scene.gltf(
    filepath='/tmp/output.glb',
    export_format='GLB',
    export_apply=True,                # apply modifiers
    export_materials='EXPORT',
    export_image_format='AUTO',       # PNG; AUTO falls back to JPEG for opaque
    export_yup=True,                  # Y-up convention (most engines expect this)
    export_animations=False,          # toggle on for animated models
    export_morph=True,                # shape keys
    export_skins=True,                # armatures + weights
)
```

---

## FBX — the industry-standard DCC format

**Strengths**: Universal in animation/VFX. Carries skeletons, animations, materials reasonably.

**Weaknesses**: Proprietary (Autodesk). Texture/material handling is flaky between tools. Animation linking can break.

```python
import bpy

bpy.ops.export_scene.fbx(
    filepath='/tmp/output.fbx',
    use_selection=False,
    apply_unit_scale=True,
    apply_scale_options='FBX_SCALE_ALL',
    bake_space_transform=True,        # critical: applies rotation to mesh
    object_types={'MESH', 'ARMATURE', 'EMPTY'},
    use_mesh_modifiers=True,
    mesh_smooth_type='FACE',          # 'FACE' or 'EDGE' or 'OFF'
    use_subsurf=False,                # apply SubSurf or skip; usually apply
    use_armature_deform_only=True,    # only export deform bones
    bake_anim=True,
    bake_anim_use_all_bones=True,
    bake_anim_use_nla_strips=True,
    bake_anim_use_all_actions=True,
    bake_anim_force_startend_keying=True,
    bake_anim_step=1.0,
    bake_anim_simplify_factor=1.0,
    embed_textures=True,              # critical: embed PNG into FBX
    path_mode='COPY',                 # textures copied next to FBX
    axis_forward='-Z',
    axis_up='Y',
)
```

### FBX gotchas (the "why is this broken" list)

| Issue | Cause | Fix |
|-------|-------|-----|
| Model rotated 90° in Unity | Blender Z-up, Unity Y-up | Set `axis_up='Y'`, `axis_forward='-Z'` |
| Model 100× too large | Unit scale mismatch | Apply Transform on object, set unit scale to 1 |
| Textures missing | Not embedded | `embed_textures=True, path_mode='COPY'` |
| Animation only plays one action | FBX limitation: one default action | Use NLA + bake actions |
| Materials look wrong in target | Principled BSDF doesn't fully translate | Bake textures manually before export |
| Bone count exceeds limit | Game engine bone caps | Limit weights to 4 per vertex |

---

## OBJ — the simple, universal format

**Strengths**: Everything reads it. Stores geometry + UVs + simple materials (.mtl sidecar).

**Weaknesses**: No animation. No rigging. Materials limited (basic Phong shading).

```python
import bpy

bpy.ops.wm.obj_export(
    filepath='/tmp/output.obj',
    export_animation=False,
    export_selected_objects=False,
    apply_modifiers=True,
    export_eval_mode='DAG_EVAL_VIEWPORT',   # use viewport state of modifiers
    export_uv=True,
    export_normals=True,
    export_materials=True,
    export_triangulated_mesh=False,
    export_colors=False,
    export_smooth_groups=False,
    forward_axis='NEGATIVE_Z',
    up_axis='Y',
)
```

**Use OBJ for**: simple model exchange, 3D scanning output, generic geometry transfer where you control both ends.

---

## USD — the future of pipeline interchange

**Strengths**: Pixar's standard. Composition (layers, references, variants). Massive scenes. Multi-DCC native.

**Weaknesses**: Complex setup. Limited Blender material translation.

```python
import bpy

bpy.ops.wm.usd_export(
    filepath='/tmp/scene.usdc',
    export_animation=True,
    export_hair=False,
    export_uvmaps=True,
    export_normals=True,
    export_materials=True,
    use_instancing=True,
    export_textures=True,
    overwrite_textures=True,
)
```

**USD variants**:
- `.usd` — text-based (debuggable, large)
- `.usdc` — binary (compact, fast)
- `.usda` — ASCII (human-readable, larger)
- `.usdz` — zipped USD with all assets (Apple AR/iOS standard)

---

## STL — for 3D printing

```python
import bpy

bpy.ops.wm.stl_export(
    filepath='/tmp/output.stl',
    ascii_format=False,           # binary STL (smaller, faster)
    apply_modifiers=True,
)
```

**STL pitfalls**:
- ❌ STL has NO units. Most slicers assume mm.
- ❌ STL has NO color/material — always single-color grey.
- ❌ Mesh must be **watertight** (no holes, no flipped normals, no internal faces).
- ✅ Pre-export check: `Mesh → Clean Up → Make Manifold` in Edit Mode.

---

## Asset Browser (production studio workflow)

The Asset Browser is Blender's library system — share materials, models, brushes, node groups across projects.

### Mark something as an asset
```python
import bpy

obj = bpy.data.objects['GEO-character']
obj.asset_mark()          # makes it appear in Asset Browser
obj.asset_data.tags.new('character')
obj.asset_data.tags.new('hero')
obj.asset_data.description = 'Main character with full rig'
obj.asset_generate_preview()   # auto-render thumbnail
```

### Asset library locations
Configure in Preferences → File Paths → Asset Libraries. Each library is a folder of `.blend` files; all marked assets across them appear in the browser.

### Linked vs Appended assets
| | Linked | Appended |
|---|--------|---------|
| File size | Tiny (just reference) | Full embed |
| Updates from source | Yes (auto) | No (snapshot) |
| Editable | Read-only (use override) | Yes |
| Use case | Studio asset library | One-off use, modify freely |

### Library Overrides
Linked assets are read-only. **Library Override** creates an editable proxy:
- Mesh, materials, modifiers stay linked (source updates propagate)
- Position, scale, custom properties become editable per-instance
- Best of both: shared source + per-shot tweaks

```python
# Make selected linked object an override
bpy.ops.object.make_override_library()
```

---

## Production pipeline patterns

### Pattern A: Single-artist project
```
project/
├── assets/
│   ├── characters/
│   │   └── hero.blend (with marked assets)
│   ├── environments/
│   │   └── forest.blend
│   └── props/
├── shots/
│   ├── shot01.blend (links from assets/)
│   └── shot02.blend
└── render/
    ├── shot01/
    └── shot02/
```

Edit assets in their .blend; shots link them. Update propagates.

### Pattern B: Studio with version control
- Asset .blend files live in Git LFS or Perforce.
- Shots link assets via relative paths.
- Library Overrides per-shot for tweaks.
- Render outputs go to network storage (NAS or cloud).

### Pattern C: USD-based pipeline
- Each department exports USD layers.
- Shots compose layers via USD composition.
- Materials, animation, lighting, FX in separate USDs.
- Final composite in USD-aware renderer (Karma, Renderman, Cycles via Hydra).

---

## Common pitfalls

| Mistake | Why | Fix |
|---------|-----|-----|
| Exported FBX has no textures | Forgot embed | `embed_textures=True` |
| Game engine bone count exceeded | Too many weights per vertex | `Limit Total → 4` in vertex groups |
| glTF material looks different | Procedural shader didn't export | Bake to image textures first |
| OBJ won't import elsewhere | UTF-8 vs ASCII issue | Stick to ASCII filenames |
| STL won't print (slicer error) | Non-manifold geometry | Make Manifold, recompute normals |
| USD imports broken | Material translation lossy | Use shared MaterialX or PBR-only materials |
| Linked asset doesn't update | Path is absolute | Use relative paths (`//assets/...`) |
| Forgot to set animation export | Static mesh only | Toggle `export_animations=True` for glTF, `bake_anim=True` for FBX |

---

## Sources

- [glTF 2.0 — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- [FBX — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_fbx.html)
- [Asset Browser — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/editors/asset_browser.html)
- [Library Overrides — Blender Developer Docs](https://developer.blender.org/docs/features/core/overrides/library/functional_design/)
- [Fixie — STL vs OBJ vs FBX vs STEP comparison](https://www.fixie3d.com/fixie-blog/2025/9/25/stl-vs-obj-vs-fbx-vs-step-best-export-format-for-revit-rhino-amp-blender-watertight-guide)
- [Alpha3D — Mastering FBX in Blender for game development](https://www.alpha3d.io/kb/3d-modelling/blender-fbx/)
- [Tripo3D — Multi-format export strategy: FBX, OBJ, GLB, USDZ, USD](https://www.tripo3d.ai/blog/explore/multi-format-export-strategy-fbx-obj-glb-usdz-usd)
- [Blender Studio — Asset Browser Fundamentals 4.5 LTS](https://studio.blender.org/training/blender-fundamentals-45-lts/blender_4-5_lts_asset-browser/)
- [Khronos glTF 2.0 Spec](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0)

---

## Outstanding

- [ ] Unreal Engine specific export checklist
- [ ] Unity-specific quirks (axis conversion, scale)
- [ ] USDZ for Apple AR (specific texture limits)
- [ ] Roundtrip workflow: Blender → Substance → back
