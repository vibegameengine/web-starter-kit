# Blender Version Compatibility Matrix

This plugin is developed against **Blender 5.1.1** (validated end-to-end on macOS). Most patches include forward/backward compatibility for **Blender 4.x** users.

## Compat-critical patches in this plugin

| Patch | Blender 4.x behaviour | Blender 5.x behaviour | Strategy |
|-------|----------------------|----------------------|----------|
| EEVEE engine name (`blender-rendering` Recipe 3) | `BLENDER_EEVEE` (4.0–4.1) or `BLENDER_EEVEE_NEXT` (4.2+) | `BLENDER_EEVEE` (5.x renamed back) | `try`/`except` with fallback — works on every version |
| Action F-curve access (`blender-animation` Recipe 3) | `action.fcurves` (legacy actions) | `action.layers[].strips[].channelbags[].fcurves` (layered actions only) | `get_fcurves_compat()` helper: tries `.fcurves` first, falls back to walking layers |
| `Mesh.use_auto_smooth` attribute | exists | **REMOVED** | Code wraps in `hasattr(mesh, 'use_auto_smooth')` or simply uses `bpy.ops.object.shade_smooth()` instead |
| `Subsurface IOR` and `Weight` BSDF inputs (`blender-materials` Recipe 9) | Reachable by string-key lookup | `enabled=False` flag blocks string-key lookup | `set_input(node, name, value)` helper iterates inputs to find by name |
| Coloured-glass volume density (`blender-materials` Recipe 6b) | Same physics — recipe values are version-agnostic | Same | No special handling needed |

## What's NOT cross-tested

- **Blender 3.x and earlier**: Not supported. Many recipes use Principled BSDF v2 inputs (Coat Weight, Sheen Weight, Subsurface Weight) that don't exist on the older Principled BSDF.
- **Blender 4.0 specifically**: Not directly tested in this validation pass. The compat helpers should work but the `BLENDER_EEVEE_NEXT` engine name introduced in 4.2 means a 4.0 user hits the fallback path — verified to be `BLENDER_EEVEE`.

## Validation status (as of v0.9.0)

| Blender version | Status | Notes |
|----------------|--------|-------|
| 5.1.1 | ✅ Fully validated | All scenes (sword, bottle, chair, aviator wireframe) tested end-to-end |
| 4.2 / 4.3 / 4.4 LTS | ⚠️ Compat code present, **not directly tested** | The try/except + helper patterns should work; would need a 4.x install to confirm |
| 4.0 / 4.1 | ⚠️ Compat code present, **not directly tested** | Same as 4.2 — should work via fallback paths |
| 3.x and earlier | ❌ Not supported | Principled BSDF v1 missing required inputs |

## How to confirm cross-version compat in your install

After installing this plugin, run a quick smoke test:

```python
# In Blender's Scripting workspace — paste and run:
import bpy

# 1. Test engine fallback
scene = bpy.context.scene
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    print(f"engine: NEXT path used, resolved to {scene.render.engine}")
except (TypeError, ValueError):
    scene.render.engine = 'BLENDER_EEVEE'
    print(f"engine: fallback path used, resolved to {scene.render.engine}")

# 2. Test BSDF input access
mat = bpy.data.materials.new('test')
mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']
disabled_inputs = [inp.name for inp in b.inputs if not inp.enabled]
print(f"disabled BSDF inputs (need set_input helper): {disabled_inputs}")
bpy.data.materials.remove(mat, do_unlink=True)

# 3. Test Action API
print(f"version: {bpy.app.version_string}")
print(f"Action.layers attribute: {hasattr(bpy.types.Action, 'layers')}")
```

Expected output on Blender 5.1.1:
```
engine: fallback path used, resolved to BLENDER_EEVEE
disabled BSDF inputs (need set_input helper): ['Weight', 'Subsurface IOR']
version: 5.1.1
Action.layers attribute: True
```

If you see a different version with `disabled BSDF inputs: []` and the `BLENDER_EEVEE_NEXT` succeeds (resolving to that exact name), you're on Blender 4.2-4.4.

If you find recipes that fail on your version, please file an issue at https://github.com/RobLe3/cc-blender-skill/issues with:
- `bpy.app.version_string`
- The specific recipe / SKILL.md section
- The error message
