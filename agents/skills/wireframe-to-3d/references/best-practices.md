# Blender Best Practices for the Wireframe-to-3D Skill

**Purpose**: Expert knowledge and established patterns for building robust, performant Blender scripts integrated with Claude.

**Status**: Comprehensive reference compiled from official Blender documentation, Blender Studio standards, and community best practices.

**Date**: 2026-04-27

---

## 1. Python API Performance Optimization

### 1.1 List Operations (Critical for Speed)

**❌ Avoid**:
```python
# String concatenation in loops (very slow)
result = ""
for item in large_list:
    result = result + str(item)  # Creates new string each iteration

# Inefficient list operations
my_list.remove(item)  # O(n) — searches entire list
```

**✓ Prefer**:
```python
# List comprehension or append
result = [str(item) for item in large_list]
# or
parts = []
for item in large_list:
    parts.append(str(item))
result = "".join(parts)  # Single operation

# pop() or del for removal
my_list.pop(index)  # O(1) — direct access
del my_list[-1]     # O(1) — remove last item
```

**Why it matters**: String concatenation creates a new object each time; `append()` modifies in-place (no allocation overhead).

### 1.2 Blender-Specific: foreach_get / foreach_set

**❌ Slow (Python-loop approach)**:
```python
for i, vertex in enumerate(mesh.vertices):
    vertex.co = new_positions[i]  # Crosses Blender API boundary ~n times
```

**✓ Fast (batch operation)**:
```python
# Blender 4.1+ with optimized foreach_set
mesh.vertices.foreach_set('co', new_positions_flat)  # Single API call
```

**Performance**: 10–100× faster for large meshes (thousands of vertices).

**Note**: `foreach_get()` and `foreach_set()` have been optimized for 8, 16, 64-bit storage types.

### 1.3 Context and Scene Access

**❌ Avoid repeated context lookups**:
```python
for _ in range(1000):
    bpy.context.view_layer.objects.active = obj  # API call each iteration
```

**✓ Cache context references**:
```python
view_layer = bpy.context.view_layer
for _ in range(1000):
    view_layer.objects.active = obj  # Local variable access
```

### 1.4 Batch Operations > Individual Operations

**❌ Individual operations**:
```python
for obj in objects:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()  # Operator call per object
```

**✓ Batch operations**:
```python
# Use bpy.data API instead of bpy.ops where possible
for obj in objects:
    obj.data.use_smooth_shade = True  # Direct property access, no operator
```

**Why**: `bpy.ops` (operators) are slower; they trigger UI updates and validation. Use `bpy.data` API for property access when available.

### 1.5 Memory Management for Large Scenes

**When processing large models**:
```python
# Delete temporary objects immediately
bpy.data.objects.remove(temp_obj, do_unlink=True)

# Clear collections
for obj in collection.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

# Don't keep references to deleted objects
# After deletion, do not access obj.xxx
```

**Tip**: Import/export in isolated scenes, then merge only final geometry into main scene.

---

## 2. Mesh Topology Standards

### 2.1 Quad-Dominant Topology

**Why Quads Matter**:
- **Subdivision Surface modifier**: Quads subdivide evenly; triangles create pinching
- **Animation/deformation**: Quads deform predictably; n-gons cause artifacts
- **UV unwrapping**: Quads have natural flow; n-gons break continuity

**Target polycount for glasses**:
- `≤ 30,000 triangles` (TECH-SPEC.md requirement)
- Typical: 5000–8000 vertices = 8000–12000 triangles

### 2.2 Avoiding Topology Anti-Patterns

**❌ Bad topology**:
```
- N-gons (polygons with > 4 sides) — especially in areas that deform
- Poles (vertices with > 5 edges) — cause pinching under subdivision
- Isolated vertices or edges — create artifacts
- High triangle count in flat areas — wasted geometry
```

**✓ Good topology**:
```
- All quads (or mostly quads with strategic triangles)
- Vertices with 4–5 edges (occasionally 3–6)
- Complete edge loops (no dangling edges)
- Density matches feature importance (dense around joints, sparse on flats)
```

### 2.3 Edge Loop Placement for Deformation

For parts that may animate in the future (eyes, hinges):

```python
# Add circumferential edge loops around rotation axes
# Example: hinge rotation axis = Z, place loops on XY planes

# Also: reduce polygon count in low-deformation areas
# (nose pads, flat bridge sections)
```

### 2.4 Post-Conversion Mesh Cleanup

**After converting curves to mesh**:
```python
import bpy

def cleanup_mesh(mesh_obj):
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.mode_set(mode='EDIT')
    
    # Remove duplicate vertices (threshold = 0.0001 for precision)
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    
    # Ensure consistent normals
    bpy.ops.mesh.normals_make_consistent(inside=False)
    
    # Apply smooth shading (prepares for export)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
```

---

## 3. Curve Modeling Best Practices

### 3.1 Resolution Settings (Critical for Quality vs. Performance)

```python
import bpy

def set_curve_resolution(curve_obj, preview_u=12, render_u=24):
    """Configure curve tessellation resolution.
    
    Args:
        preview_u: Viewport resolution (lower = faster viewport)
        render_u: Export/render resolution (higher = smoother curves)
    
    For wireframes:
        - preview_u = 12–16 (fast viewport feedback)
        - render_u = 20–24 (smooth export)
    """
    curve_data = curve_obj.data
    curve_data.resolution_u = preview_u
    curve_data.render_resolution_u = render_u if render_u > 0 else preview_u
```

**Impact on polygon count**:
- Cubic Bezier spline with 4 control points + resolution_u=12 ≈ 48 mesh segments
- Extrude with bevel_depth ≈ 400 vertices for thin wire

### 3.2 Handle Types for Smooth Continuity

```python
def set_bezier_handles_smooth(spline):
    """Set all handles to ALIGNED for C¹ continuity (smooth tangent)."""
    for pt in spline.bezier_points:
        pt.handle_left_type = 'ALIGNED'   # Collinear, can scale independently
        pt.handle_right_type = 'ALIGNED'
```

**Handle types**:
- **ALIGNED**: Handles collinear, C¹ continuous (smooth)
- **AUTO**: Blender auto-smooths, C² continuous (curvature continuous)
- **FREE**: Independent, no continuity guarantee (sharp corners OK)

**For glasses frames**: Use ALIGNED (cleaner CAD look than AUTO, smoother than FREE).

### 3.3 Bevel Depth for Wire Thickness

```python
def apply_bevel(curve_obj, thickness_mm=1.0):
    """Apply bevel to simulate wire thickness.
    
    Args:
        thickness_mm: Thickness of the "wire" (e.g., 1.0mm)
    
    Note: Bevel is a visual property; actual thickness baked into
    mesh geometry when converted.
    """
    curve_obj.data.bevel_depth = thickness_mm / 2000.0  # Convert mm to Blender units
    curve_obj.data.bevel_resolution = 8  # Segments around circumference
```

**Polygon impact**:
- bevel_depth + bevel_resolution: adds ~16 faces per curve segment
- For thin wires: bevel_resolution = 6–8 sufficient

### 3.4 Fill Caps for Closed Geometry

```python
def configure_curve_for_export(curve_obj):
    """Configure curve properties for clean mesh export."""
    curve_data = curve_obj.data
    curve_data.use_fill_caps = True      # Close ends if bevel used
    curve_data.use_smooth_preview = True # Smooth in viewport
    curve_data.dimensions = '3D'         # Ensure 3D (not 2D)
```

---

## 4. Materials and PBR Workflow

### 4.1 Principled BSDF Setup for glTF Export

**Critical**: Only Principled BSDF shader nodes export properly to glTF. No procedural nodes.

```python
def create_pbr_material(name, base_color, metallic=0.0, roughness=0.5, ior=1.5):
    """Create export-safe PBR material.
    
    Args:
        base_color: (R, G, B, A) tuple, e.g., (0.8, 0.1, 0.05, 1.0)
        metallic: [0, 1] — 0=dielectric (non-metal), 1=perfect metal
        roughness: [0, 1] — 0=mirror, 1=completely matte
        ior: Index of refraction (1.0–2.0 typical; 1.5 for glass)
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = base_color
    mat.metallic = metallic
    mat.roughness = roughness
    
    # Access Principled BSDF node
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = base_color
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['IOR'].default_value = ior
    
    return mat
```

**Material presets for glasses**:
```python
MATERIALS = {
    'Frame': {
        'base_color': (0.08, 0.08, 0.10, 1.0),  # Dark gray
        'metallic': 1.0,
        'roughness': 0.25,  # Brushed steel finish
    },
    'Lens': {
        'base_color': (0.05, 0.08, 0.15, 1.0),  # Dark blue tint
        'metallic': 0.8,
        'roughness': 0.05,  # Mirror-smooth
        'ior': 1.5,
    },
    'NosePad': {
        'base_color': (0.65, 0.63, 0.60, 1.0),  # Light warm gray
        'metallic': 0.0,
        'roughness': 0.7,  # Silicone matte
    },
}
```

### 4.2 Texture Maps (Only if Necessary)

**Keep textures small for GLB export**:
- Maximum: 1024×1024 PNG per texture
- Prefer flat PBR colors (no textures) if detail not critical
- If using textures: pack ORM (Occlusion, Roughness, Metallic) into one image

**Avoid for export**:
- ❌ Procedural textures (Clouds, Noise, Gradient nodes)
- ❌ Compressed formats (KTX2, Basis Universal)
- ❌ High-resolution images (> 2048×2048)

---

## 5. Modifier Stack Order (Critical)

### 5.1 Correct Modifier Ordering

**The order matters**. This sequence is typical for our glasses:

```
1. [Input Geometry]
   ↓
2. Bevel (shape the base geometry edges)
   ↓
3. Subdivision Surface (smooth topology)
   ↓
4. [Apply modifiers here if needed]
   ↓
5. [Export to GLB]
```

**Why this order**:
1. **Bevel first**: Creates clean beveled edges on simple base geometry
2. **Subdivision after**: Smooths while preserving beveled edges (doesn't pinch)

**❌ Wrong order** (Subdivision → Bevel):
- Subdivision makes the mesh dense and complex
- Bevel then tries to apply sharp edges to dense surface
- Result: pinching, artifacts, poor performance

### 5.2 Apply Modifiers Before Export

```python
def apply_modifiers(mesh_obj):
    """Convert modifiers to geometry before export."""
    bpy.context.view_layer.objects.active = mesh_obj
    
    for modifier in mesh_obj.modifiers:
        # Skip ignored types if necessary
        bpy.ops.object.modifier_apply(modifier=modifier.name)
```

**When to apply**:
- ✓ Always before glTF export (export doesn't preserve modifier stack)
- ✓ After final optimization (Decimate, Subdivision)
- ❌ Don't apply if you might edit later (keep .blend non-destructive)

### 5.3 Subdivision Surface for Smoothness

```python
def add_subdivision_surface(mesh_obj, levels=2, render_levels=3):
    """Add smooth subdivision surface.
    
    Args:
        levels: Viewport subdivision level (lower = faster viewport)
        render_levels: Export/render subdivision (higher = smoother)
    
    For glasses: levels=1–2, render_levels=2–3 typical
    """
    subdiv = mesh_obj.modifiers.new(name='Subdivision', type='SUBSURF')
    subdiv.levels = levels
    subdiv.render_levels = render_levels
    return subdiv
```

**Impact**: Roughly 4× geometry increase per level (be careful with large models).

---

## 6. Naming Conventions (Blender Studio Standards)

### 6.1 Datablock Naming Pattern

**Format**: `PREFIX-BASE_NAME.SUFFIX`

```
GEO-lens_right.L        (Geometry, lens, right side, left in world)
GEO-bridge.C            (Geometry, bridge, center)
MAT-frame_metal         (Material, frame, metal type)
ARM-temple_left         (Armature/rig, temple arm, left)
LGT-key                 (Light, key light for 3-point setup)
```

**Rules**:
- **Prefix** (`GEO`, `MAT`, `LGT`): Purpose/type of datablock
- **Base name** (snake_case): What it is
- **Suffix** (`.L`, `.R`, `.C`): Symmetry or variant
- **Separator**: `-` between parts, `.` for symmetry

### 6.2 Collections (Scene Organization)

```
Scene Root
├── GEO                 (Geometry collection)
│   ├── Lenses
│   ├── Frame
│   └── Hardware
├── MAT                 (Materials — reference only, don't store here)
└── Lights              (Optional, if including lighting)
```

### 6.3 Script-Generated Names (Skill Responsibility)

When creating objects in our skill:

```python
def create_curve_with_name(base_name, contour_index=0):
    """Generate properly-named Blender object."""
    # Format: feature_type + sequential index
    obj_name = f"GEO-{base_name}_{contour_index:03d}"
    
    curve_data = bpy.data.curves.new(name=obj_name, type='CURVE')
    curve_obj = bpy.data.objects.new(obj_name, curve_data)
    return curve_obj
```

---

## 7. Non-Destructive Workflow Principles

### 7.1 Keep Original Geometry Editable

**For skill execution**:
```python
def setup_workflow():
    """Create isolated collection for skill-generated geometry."""
    # Create new collection
    col = bpy.data.collections.new('WireframeSkill_Output')
    bpy.context.scene.collection.children.link(col)
    
    # All generated objects go into this collection
    # User can easily delete/redo by clearing collection
    return col
```

**Benefit**: User can undo entire skill output by deleting collection.

### 7.2 Don't Modify Existing Scene Objects

**✓ Do**:
- Create new objects from scratch
- Link to isolated collection
- Name clearly (use `GEO-` prefix)

**❌ Don't**:
- Modify pre-existing objects
- Add modifiers to user's existing geometry
- Delete or rename user objects

---

## 8. Export Optimization for glTF / GLB

### 8.1 Export Settings

```python
def export_to_glb(filepath, optimize=True):
    """Export scene to optimized GLB file.
    
    Args:
        filepath: Output .glb path
        optimize: Apply export optimizations
    """
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',                # Binary, not .gltf + .bin
        export_materials=True,              # Include PBR materials
        export_uv=True,                     # Flatten UV map
        export_normal=True,                 # Per-vertex normals
        export_tangents=False,              # Skip unless parallax mapping used
        export_colors=False,                # No vertex colors needed
        export_animations=False,            # We drive motion in JS
        include_deform_bones=False,         # No rigging
        export_image_format='PNG',          # PNG only (no JPEG, KTX2)
    )
```

### 8.2 File Size Check and Optimization

```python
import os

def check_and_optimize_glb(filepath, max_mb=15):
    """Verify export size; apply decimation if needed."""
    size_bytes = os.path.getsize(filepath)
    size_mb = size_bytes / (1024 * 1024)
    
    if size_mb > max_mb:
        print(f"⚠ File {size_mb:.2f} MB exceeds limit {max_mb} MB")
        return False
    else:
        print(f"✓ File size OK: {size_mb:.2f} MB")
        return True

def apply_decimate(mesh_obj, target_ratio=0.8):
    """Reduce polygon count if export oversized."""
    bpy.context.view_layer.objects.active = mesh_obj
    
    decimate = mesh_obj.modifiers.new(name='Decimate', type='DECIMATE')
    decimate.ratio = target_ratio
    decimate.use_collapse_degenerate = True
    
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    
    print(f"Applied Decimate (ratio={target_ratio}) to {mesh_obj.name}")
```

**Target file size**:
- Ideal: ≤ 8 MB
- Hard cap: ≤ 15 MB (from TECH-SPEC.md)

### 8.3 Final Validation Before Export

```python
def validate_before_export(mesh_obj):
    """Last-minute checks before export."""
    mesh = mesh_obj.data
    errors = []
    
    # Check for isolated vertices
    if len(mesh.vertices) > 0:
        edge_count = {}
        for edge in mesh.edges:
            for v in edge.vertices:
                edge_count[v] = edge_count.get(v, 0) + 1
        
        for v_idx in range(len(mesh.vertices)):
            if v_idx not in edge_count:
                errors.append(f"Isolated vertex {v_idx}")
    
    # Check for degenerate faces
    for face in mesh.polygons:
        if len(face.vertices) < 3:
            errors.append(f"Degenerate face {face.index}")
    
    return errors
```

---

## 9. Viewport and Rendering Performance

### 9.1 Viewport Performance Tips

**For interactive feedback** (while user waits):

```python
def optimize_viewport_for_speed():
    """Configure viewport for fastest feedback during model building."""
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            # Use Solid shading (faster than Material Preview)
            space.shading.type = 'SOLID'
            
            # Disable expensive overlays
            space.overlay.show_wireframe = False
            space.overlay.show_face_orientation = False
```

### 9.2 Rendering for Preview Images (Optional)

If skill generates preview screenshots:

```python
def setup_viewport_for_screenshot(max_size=800):
    """Configure viewport for high-quality screenshot."""
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.shading.type = 'MATERIAL'  # Show materials
            
    # Return screenshot via MCP
```

---

## 10. Error Handling and Debugging

### 10.1 Try-Except Patterns for Robustness

```python
def safe_operation(func, *args, **kwargs):
    """Wrap Blender operations with error handling."""
    try:
        return func(*args, **kwargs)
    except RuntimeError as e:
        # Blender API errors
        print(f"❌ Blender error: {e}")
        return None
    except IndexError as e:
        # Missing data (object, vertex, etc.)
        print(f"❌ Data access error: {e}")
        return None
    except Exception as e:
        # Catch-all
        print(f"❌ Unexpected error: {type(e).__name__}: {e}")
        return None
```

### 10.2 Logging for Debugging

```python
import logging

def setup_logging(verbose=False):
    """Configure logging for skill execution."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )
    return logging.getLogger('WireframeSkill')

log = setup_logging(verbose=True)
log.info("Starting wireframe processing")
log.debug(f"Created object: {obj_name}")
```

### 10.3 Validation Checkpoints

```python
def checkpoint(condition, message):
    """Assert and log failures."""
    if not condition:
        raise AssertionError(message)
    print(f"✓ {message}")

# Usage
checkpoint(mesh_obj is not None, "Mesh object created")
checkpoint(len(mesh_obj.data.vertices) > 0, "Mesh has vertices")
```

---

## 11. Skill-Specific Best Practices

### 11.1 Isolated Execution Environment

```python
def create_isolated_workspace():
    """Create a clean, separate workspace for skill operations."""
    # New collection
    workspace = bpy.data.collections.new('WireframeSkill_Workspace')
    bpy.context.scene.collection.children.link(workspace)
    
    # Work only in this collection
    # Easy to delete all outputs by deleting collection
    return workspace

def cleanup_workspace(workspace):
    """Remove all skill-generated geometry if needed."""
    for obj in workspace.objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    
    bpy.data.collections.remove(workspace)
```

**Benefit**: User can undo entire skill by deleting one collection.

### 11.2 Batch Curve-to-Mesh Conversion

```python
def convert_curves_to_meshes(curve_objects):
    """Efficiently convert multiple curves to meshes."""
    mesh_objects = []
    
    for curve_obj in curve_objects:
        bpy.context.view_layer.objects.active = curve_obj
        bpy.ops.object.convert(target='MESH')
        
        mesh_obj = bpy.context.view_layer.objects.active
        mesh_objects.append(mesh_obj)
        
        # Cleanup immediately
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.remove_doubles(threshold=0.0001)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    
    return mesh_objects
```

### 11.3 Progress Reporting (for User Feedback)

```python
def process_with_progress(items, process_func, label="Processing"):
    """Process items with progress reporting."""
    total = len(items)
    for i, item in enumerate(items):
        progress = (i + 1) / total * 100
        print(f"[{progress:.0f}%] {label}: {i+1}/{total}")
        process_func(item)
```

---

## Quick Reference Checklist

**Before Exporting**:
- [ ] All objects named with `GEO-` prefix
- [ ] All materials use Principled BSDF only
- [ ] Modifiers applied (Bevel → Subdivision Surface order correct)
- [ ] Mesh cleaned (remove doubles, consistent normals)
- [ ] UV map flattened (even if no textures)
- [ ] No procedural shaders in materials
- [ ] No isolated vertices or degenerate faces
- [ ] Estimated triangle count < 8000 for glasses
- [ ] File size < 15 MB after export
- [ ] All objects in organized collection

**For Smooth Curves**:
- [ ] Handle types = ALIGNED (or AUTO)
- [ ] resolution_u = 12–24 (higher = smoother)
- [ ] bevel_depth appropriate (1–2 mm for wires)
- [ ] No sharp corners (unless intentional)

**For Performance**:
- [ ] Use foreach_set() instead of loops for vertex data
- [ ] Cache context references
- [ ] Batch operations where possible
- [ ] Delete temporary objects immediately
- [ ] Apply modifiers before export

---

## Sources

- [Blender Python API Best Practices](https://docs.blender.org/api/current/info_best_practice.html)
- [The Art of Good Topology Guide — CG Cookie](https://cgcookie.com/posts/the-art-of-good-topology-blender)
- [glTF 2.0 Export — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- [Blender Modifier Stack Order — The Art of Braxton Wise](https://braxtonwise.com/blender-modifier-order-modifier-stack/)
- [Blender Naming Conventions — Blender Studio](https://studio.blender.org/tools/naming-conventions/introduction)
- [Procedural 3D Modeling for Beginners — Sloyd AI](https://www.sloyd.ai/blog/beginners-guide-to-3d-asset-generation)
- [Blender Curve Modeling Best Practices — Wikibooks](https://en.wikibooks.org/wiki/Blender_3D:_Noob_to_Pro/Intro_to_Bezier_Curves)
- [Optimize Blender CYCLES & EEVEE — CGVerse](https://www.cgverse.com/blog/optimize-blender-cycles-eevee-fastest-render-settings-performance-guide/)
- [Blender Python API — Blender Developer Documentation](https://developer.blender.org/docs/release_notes/4.1/python_api/)
- [Topology Guides](https://topologyguides.com/)
- [Deform Ready Topology in Blender — Blender Base Camp](https://www.blenderbasecamp.com/deform-ready-topology-in-blender/)

---

**Date Created**: 2026-04-27  
**Status**: Ready for skill integration  
**Usage**: Reference this when building code generators for Blender operations

## 9. Reference-Locked / Texture-First Modeling Workflow

Use this workflow when a user supplies branding art, a texture atlas, front/side/back wireframes, or says the model must fit the drawing/texture exactly. It is a corrective mode for repeated visual mismatches.

### 9.1 Source-of-truth hierarchy

1. **Front texture or front wireframe is canonical for silhouette, part count, and face placement.**
2. Side/back/top views define only depth, stacking, curvature, and hidden surfaces.
3. Textures are not decoration after the fact; they are measurement references. If the mesh silhouette does not match the texture crop, reshape the mesh rather than stretching the texture.
4. Always write a part-count checklist before running Blender code, e.g. `expected_primary_parts=<manifest_count>`, then assert the scene creates exactly that number.

### 9.2 Blender reference setup

Official Blender docs note that Image Empties are intended for reference images/blueprints and can be displayed in front/back, orthographic-only, axis-aligned, and with opacity. For skill-generated scenes, create equivalent reference planes or image empties locked to the validation cameras. Keep them out of export by prefixing `REF_` and hiding from render except overlay checks.

Reference-plane pattern:
```python
# Front reference plane in X/Z, behind model along Y.
verts = [(-w/2, y, -h/2), (w/2, y, -h/2), (w/2, y, h/2), (-w/2, y, h/2)]
# UVs [(0,0), (1,0), (1,1), (0,1)] map the full reference image 1:1.
# Prefix object name with REF_ and exclude from GLB export.
```

### 9.3 Silhouette-first mesh construction

For logos/mascots/flat designed subjects, build each visible structural part from traced 2D X/Z coordinates before adding Y depth:

```python
def make_front_locked_component(name, centerline, widths, y_layer, crown_depth):
    # centerline: list of X/Z points from the front reference
    # widths: per-row half-widths measured/traced from the reference crop
    # y_layer: stacking order, not silhouette
    # crown_depth: shallow front/back curvature; must not change X/Z outline
    # 1. Generate rows across width along local normal.
    # 2. Store UV=(width_fraction, length_fraction) for Project-from-View texture fit.
    # 3. Add depth only as +/-Y dome/extrusion after X/Z positions are fixed.
    pass
```

Do not use generic radial duplication unless the reference itself is truly radial. Logos often have intentional asymmetry, occlusion, and a fixed visible part count.

### 9.4 UV and texture fit

Blender's Project from View workflow flattens a mesh as it appears from the current view and is intended for mapping a picture of the modeled object; expect stretching on surfaces that recede from the view. For mascot/logo modeling, this means:

- front-facing hero surfaces should receive front-projected UVs;
- side/back surfaces need separate procedural/solid materials or separate UV islands;
- do not project a whole atlas over every component; crop or assign per-part UV rectangles;
- a texture mismatch is normally a mesh silhouette problem first, not a shader problem.

### 9.5 Trace and retopo tools

Blender's Trace Image to Grease Pencil can vectorize black/white images, but the manual warns that non-B/W images are converted internally and high resolutions can create dense strokes. For skill automation, prefer preprocessing a mask with Pillow/OpenCV and sampling contours, or create manually-defined control points when the source is a clean logo/wireframe.

Shrinkwrap is useful after the front silhouette is correct: it can move vertices to a target surface or project along an axis. Use it for conforming secondary details to a curved shell, not for discovering the primary silhouette.

### 9.6 Required validation gates

Before declaring success, produce at least these renders/files:

- `front_preview`: normal front render.
- `front_overlay`: front reference/wireframe blended with the model, same orthographic camera.
- `side_preview`: optional aura hidden, validates depth only.
- `back_preview`: face hidden or backside shown as specified.
- `measurements.json`: expected vs actual counts and object bounding boxes.

Checklist to print in Blender stdout:
```python
print('VALIDATE expected_primary_parts=', manifest_count, 'actual_primary_parts=', len(primary_part_objects))
print('VALIDATE front_locked=True aura_excluded_from_base_export=True')
```

If `actual_primary_parts != expected_primary_parts`, stop and do not export.

### 9.7 Sources consulted

- Blender Manual: Image Empty/reference-image settings for blueprint-style modeling.
- Blender Manual: UV Project from View for mapping a reference picture onto a modeled object.
- Blender Manual: Trace Image to Grease Pencil; best results from manually prepared black/white images and controlled resolution.
- Blender Manual: Shrinkwrap Modifier; use projection/nearest-surface wrapping to conform secondary geometry to a target surface.
