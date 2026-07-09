# Blender Integration Guide — From Wireframe Analysis to 3D Model

**Purpose**: Reference for converting `wireframe_analyzer.py` output (Bezier control points) into Blender curves, meshes, materials, and exported GLB.

**Target Audience**: Skill developers integrating wireframe analysis into Blender MCP workflow.

---

## 1. Pipeline Overview

```
JSON wireframe analysis
    ↓
Create Blender curves (parametric Bezier)
    ↓
Apply extrusion/bevel (convert to mesh)
    ↓
Apply materials (PBR colors)
    ↓
Validate topology (check for errors)
    ↓
Export GLB (embedded, ≤15MB)
```

---

## 2. Parsing Analyzer Output

### 2.1 JSON Structure

```json
{
  "metadata": {
    "image_size": [800, 600],
    "num_contours": 3,
    "parameters": {
      "rdp_epsilon": 2.0,
      "canny_threshold1": 50,
      "canny_threshold2": 150
    }
  },
  "contours": [
    [[x0, y0], [x1, y1], ..., [xn, yn]],
    ...
  ],
  "bezier_curves": [
    [
      [[x0, y0], [x1, y1], [x2, y2], [x3, y3]],  // First cubic Bezier segment
      [[x3, y3], [x4, y4], [x5, y5], [x6, y6]],  // Second segment (continuous)
      ...
    ],
    ...  // Repeat for each contour
  ]
}
```

### 2.2 Loading in Python

```python
import json
import bpy
from pathlib import Path

def load_analyzer_json(json_path: str) -> dict:
    """Load wireframe analysis from JSON."""
    with open(json_path) as f:
        return json.load(f)

# Usage
data = load_analyzer_json('wireframe_analyzed.json')
img_width, img_height = data['metadata']['image_size']
bezier_curves = data['bezier_curves']
contours = data['contours']
```

---

## 3. Creating Blender Curve Objects

### 3.1 Single Bezier Curve from Control Points

```python
import bpy
import math

def create_bezier_curve(name: str, control_points: list) -> bpy.types.Object:
    """
    Create a Blender Bezier curve from control points.
    
    Args:
        name: Object name
        control_points: List of (x, y, z) tuples or 4-element lists [[P0], [P1], [P2], [P3]]
    
    Returns:
        Blender curve object
    """
    # Create curve data
    curve_data = bpy.data.curves.new(name=name, type='CURVE')
    curve_data.dimensions = '3D'
    
    # Create object and link to scene
    curve_obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(curve_obj)
    
    # Add Bezier spline
    spline = curve_data.splines.new(type='BEZIER')
    spline.bezier_points.add(len(control_points) - 1)
    
    # Set control points
    for i, cp in enumerate(control_points):
        pt = spline.bezier_points[i]
        
        # Handle 2D → 3D conversion (use Z=0 for front view)
        if len(cp) == 2:
            x, y = cp
            z = 0.0
        else:
            x, y, z = cp[0], cp[1], cp[2]
        
        pt.co = (x, y, z, 1.0)  # 4D homogeneous
        pt.handle_left_type = 'ALIGNED'
        pt.handle_right_type = 'ALIGNED'
    
    return curve_obj
```

### 3.2 Multi-Segment Curve from Analyzer Output

```python
def create_curve_from_analyzer(name: str, curve_segments: list, z_offset: float = 0.0):
    """
    Create continuous Blender curve from analyzer's multi-segment output.
    
    Args:
        name: Object name
        curve_segments: List of segment control point sets [[P0,P1,P2,P3], [P3,P4,P5,P6], ...]
        z_offset: Z coordinate (for positioning front/side views)
    
    Returns:
        Blender curve object
    """
    curve_data = bpy.data.curves.new(name=name, type='CURVE')
    curve_data.dimensions = '3D'
    
    curve_obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(curve_obj)
    
    spline = curve_data.splines.new(type='BEZIER')
    
    # Flatten segments, removing duplicates at segment boundaries
    all_points = []
    for i, segment in enumerate(curve_segments):
        if i == 0:
            all_points.extend(segment)
        else:
            # Skip first point (duplicate of last point of previous segment)
            all_points.extend(segment[1:])
    
    spline.bezier_points.add(len(all_points) - 1)
    
    for i, cp in enumerate(all_points):
        pt = spline.bezier_points[i]
        x, y = cp[0], cp[1]
        pt.co = (x, y, z_offset, 1.0)
        pt.handle_left_type = 'ALIGNED'
        pt.handle_right_type = 'ALIGNED'
    
    # Set curve properties
    curve_data.resolution_u = 24  # Resolution for tessellation
    curve_data.bevel_depth = 0.001  # Wire thickness (1mm)
    curve_data.use_fill_caps = True  # Cap ends if converting to mesh
    
    return curve_obj
```

### 3.3 Handle Type Selection

**For continuous, smooth geometry**:
```python
pt.handle_left_type = 'ALIGNED'   # Handles are collinear (C¹ continuity)
pt.handle_right_type = 'ALIGNED'
```

**For sharp corners** (not typical for CAD):
```python
pt.handle_left_type = 'FREE'
pt.handle_right_type = 'FREE'
```

**For auto-smoothing** (Blender-controlled):
```python
pt.handle_left_type = 'AUTO'
pt.handle_right_type = 'AUTO'
```

---

## 4. Coordinate System Mapping

### 4.1 Wireframe Pixel Coordinates → Blender World Units

**Input**: Wireframe image pixels `(px_x, px_y)` in [0, width) × [0, height)

**Conversion**:
```python
def pixel_to_world(px_x: float, px_y: float,
                   img_width: int, img_height: int,
                   world_width_mm: float = 140.0,
                   world_height_mm: float = 100.0,
                   center_at_origin: bool = True) -> tuple:
    """
    Convert pixel coordinates to world coordinates.
    
    Args:
        px_x, px_y: Pixel coordinates (0 at top-left)
        img_width, img_height: Image dimensions in pixels
        world_width_mm, world_height_mm: Desired object dimensions in mm
        center_at_origin: Center at (0, 0) if True, else top-left
    
    Returns:
        (x_world, y_world) in Blender units (mm)
    """
    # Normalize to [0, 1]
    norm_x = px_x / img_width
    norm_y = py_y / img_height
    
    # Flip Y (image has origin at top; Blender prefers bottom-left)
    norm_y = 1.0 - norm_y
    
    # Scale to world dimensions
    x_world = norm_x * world_width_mm
    y_world = norm_y * world_height_mm
    
    # Center at origin
    if center_at_origin:
        x_world -= world_width_mm / 2.0
        y_world -= world_height_mm / 2.0
    
    return (x_world, y_world)
```

**Example for glasses**:
```python
# Wireframe front view: 800×600 px, glasses 140mm wide
img_width, img_height = 800, 600
px_points = [[100, 150], [200, 180], ...]

world_points = [
    pixel_to_world(px[0], px[1], img_width, img_height, 
                   world_width_mm=140.0, world_height_mm=100.0)
    for px in px_points
]
```

### 4.2 Multi-View Coordination

**Front view** (looking along -Z):
- Wireframe XY plane → Blender XY plane
- Z offset = 0 (or slightly forward)

**Side view** (looking along +X):
- Wireframe YZ plane → Blender YZ plane
- X offset = 0 (or to the right)

**Back view** (looking along +Z):
- Wireframe XY plane (mirrored) → Blender XY plane
- Z offset = depth value

---

## 5. Extrusion and Lofting

### 5.1 Simple Extrusion (Bevel for Wire Thickness)

For thin wire frames (bridges, arms, hinges):

```python
def extrude_curve_along_path(curve_obj: bpy.types.Object,
                              extrusion_axis: str = 'Z',
                              extrusion_depth: float = 10.0):
    """
    Extrude a 2D curve along a path to create 3D geometry.
    
    Args:
        curve_obj: Blender curve object (2D or 3D)
        extrusion_axis: 'X', 'Y', or 'Z'
        extrusion_depth: Distance to extrude
    """
    # Use bevel depth for wire thickness (alternative: extrude & solidify)
    curve_obj.data.bevel_depth = 0.0005  # 0.5mm wire
    curve_obj.data.resolution_u = 12     # Smooth segments
    
    # Optional: Add extrude modifier for directional depth
    extrude = curve_obj.modifiers.new(name='Extrude', type='SIMPLE_DEFORM')
    extrude.deform_type = 'STRETCH'
    # (Note: For true extrusion along curve, use curve's bevel_depth instead)
```

### 5.2 Lofting Between Profiles (For Curved Lenses)

For 3D surfaces (lenses with curvature):

```python
def create_lofted_surface(name: str, profile_curves: list,
                          num_loft_segments: int = 10) -> bpy.types.Object:
    """
    Create surface by lofting between 2D profile curves.
    
    Args:
        name: Object name
        profile_curves: List of Blender curve objects (typically 2)
        num_loft_segments: Segments along loft path
    
    Returns:
        Mesh object
    """
    # Create surface curve
    surface = bpy.data.curves.new(name, type='SURFACE')
    surface.dimensions = '3D'
    surface_obj = bpy.data.objects.new(name, surface)
    bpy.context.collection.objects.link(surface_obj)
    
    # Blender's built-in loft: add two splines, connect with interpolation
    # (More practical: use Mesh → Bridge Edge Loops after manual setup)
    
    return surface_obj
```

**Practical alternative**: Use **Bridge Edge Loops** modifier post-conversion:
```python
def bridge_edge_loops(mesh_obj: bpy.types.Object):
    """Create surface between two open edge loops (e.g., lens front + back rims)."""
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.mesh.bridge_edge_loops()  # Interactive; use in conjunction with selection
```

---

## 6. Curve-to-Mesh Conversion

### 6.1 Basic Conversion

```python
def curve_to_mesh(curve_obj: bpy.types.Object) -> bpy.types.Object:
    """
    Convert Blender curve to mesh.
    
    Args:
        curve_obj: Curve object
    
    Returns:
        New mesh object
    """
    bpy.context.view_layer.objects.active = curve_obj
    bpy.ops.object.convert(target='MESH')
    
    mesh_obj = bpy.context.view_layer.objects.active
    return mesh_obj
```

### 6.2 Post-Conversion Cleanup

```python
def cleanup_mesh(mesh_obj: bpy.types.Object, apply_smooth: bool = True):
    """
    Clean and optimize mesh after curve conversion.
    
    Args:
        mesh_obj: Mesh object
        apply_smooth: Apply smooth shading
    """
    bpy.context.view_layer.objects.active = mesh_obj
    
    # Remove duplicate vertices
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # Smooth shading
    if apply_smooth:
        bpy.ops.object.shade_smooth()
    
    # Optional: Subdivision surface for extra smoothness
    subdiv = mesh_obj.modifiers.new(name='Subdiv', type='SUBSURF')
    subdiv.levels = 1
    subdiv.render_levels = 2
```

---

## 7. Materials and PBR Setup

### 7.1 Create Principled BSDF Material

```python
def create_pbr_material(name: str, 
                        base_color: tuple = (0.8, 0.8, 0.8, 1.0),
                        metallic: float = 0.0,
                        roughness: float = 0.5,
                        ior: float = 1.5) -> bpy.types.Material:
    """
    Create PBR material for glTF export.
    
    Args:
        name: Material name
        base_color: RGBA tuple
        metallic: [0, 1] — 0=dielectric, 1=metal
        roughness: [0, 1] — 0=mirror, 1=matte
        ior: Index of refraction (typically 1.0–1.5 for non-metallic)
    
    Returns:
        Material object
    """
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = base_color
    mat.metallic = metallic
    mat.roughness = roughness
    mat.use_nodes = True
    
    # Access Principled BSDF shader
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    
    if ior != 1.5:
        bsdf.inputs['IOR'].default_value = ior
    
    return mat
```

### 7.2 Assign Material to Mesh

```python
def assign_material(mesh_obj: bpy.types.Object, material: bpy.types.Material):
    """Assign material to mesh object."""
    if len(mesh_obj.data.materials) > 0:
        mesh_obj.data.materials[0] = material
    else:
        mesh_obj.data.materials.append(material)
```

### 7.3 Example Material Set

For glasses model:
```python
materials = {
    'FrameMetal': create_pbr_material(
        'FrameMetal',
        base_color=(0.08, 0.08, 0.10, 1.0),
        metallic=1.0,
        roughness=0.25
    ),
    'LensMirror': create_pbr_material(
        'LensMirror',
        base_color=(0.05, 0.08, 0.15, 1.0),
        metallic=0.8,
        roughness=0.05,
        ior=1.5
    ),
    'Silicone': create_pbr_material(
        'Silicone',
        base_color=(0.65, 0.63, 0.60, 1.0),
        metallic=0.0,
        roughness=0.7
    ),
}

# Assign to parts
assign_material(lens_obj, materials['LensMirror'])
assign_material(frame_obj, materials['FrameMetal'])
assign_material(pad_obj, materials['Silicone'])
```

---

## 8. Validation and Quality Checks

### 8.1 Geometry Validation

```python
def validate_mesh(mesh_obj: bpy.types.Object) -> list:
    """
    Check mesh for common errors.
    
    Returns:
        List of error messages (empty if valid)
    """
    errors = []
    mesh = mesh_obj.data
    
    # Check for isolated vertices
    edge_count = {}
    for edge in mesh.edges:
        for v in edge.vertices:
            edge_count[v] = edge_count.get(v, 0) + 1
    
    for v_idx in mesh.vertices:
        if v_idx not in edge_count:
            errors.append(f"Isolated vertex {v_idx}")
    
    # Check for degenerate faces
    for face in mesh.polygons:
        if len(face.vertices) < 3:
            errors.append(f"Degenerate face {face.index}")
    
    # Check for flipped normals
    # (Not automatic; relies on user inspection in viewport)
    
    return errors
```

### 8.2 Symmetry Check (For Glasses)

```python
def check_symmetry(obj_left: bpy.types.Object, obj_right: bpy.types.Object,
                   tolerance_mm: float = 1.0) -> bool:
    """
    Verify left-right symmetry of paired objects (e.g., lenses).
    
    Returns:
        True if symmetrical within tolerance
    """
    bounds_left = [obj_left.bound_box[i] for i in range(8)]
    bounds_right = [obj_right.bound_box[i] for i in range(8)]
    
    # Compare bounding box dimensions
    width_left = max([b[0] for b in bounds_left]) - min([b[0] for b in bounds_left])
    width_right = max([b[0] for b in bounds_right]) - min([b[0] for b in bounds_right])
    
    diff = abs(width_left - width_right)
    return diff < tolerance_mm
```

---

## 9. Export to GLB

### 9.1 Export Function

```python
def export_to_glb(filepath: str,
                  objects: list = None,
                  include_animations: bool = False) -> bool:
    """
    Export Blender scene to glTF 2.0 binary (.glb).
    
    Args:
        filepath: Output file path (.glb)
        objects: List of objects to export (None = all visible)
        include_animations: Include animation data (typically False for static models)
    
    Returns:
        True if successful
    """
    try:
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            export_format='GLB',
            export_materials=True,
            export_uv=True,
            export_normal=True,
            export_tangents=False,
            export_colors=False,
            export_animations=include_animations,
            include_deform_bones=False,
            export_image_format='PNG',
        )
        return True
    except RuntimeError as e:
        print(f"Export failed: {e}")
        return False
```

### 9.2 Size Verification

```python
def check_export_size(filepath: str, max_size_mb: int = 15) -> bool:
    """Verify exported file is within size budget."""
    import os
    size_bytes = os.path.getsize(filepath)
    size_mb = size_bytes / (1024 * 1024)
    
    if size_mb > max_size_mb:
        print(f"⚠ File too large: {size_mb:.2f} MB (max {max_size_mb} MB)")
        return False
    else:
        print(f"✓ File size OK: {size_mb:.2f} MB")
        return True
```

### 9.3 Optimization: Decimate if Needed

```python
def apply_decimate(mesh_obj: bpy.types.Object, ratio: float = 0.8):
    """
    Reduce polygon count if export is oversized.
    
    Args:
        mesh_obj: Mesh object
        ratio: Keep this fraction of faces (0.8 = remove 20%)
    """
    bpy.context.view_layer.objects.active = mesh_obj
    
    decimate = mesh_obj.modifiers.new(name='Decimate', type='DECIMATE')
    decimate.ratio = ratio
    decimate.use_collapse_degenerate = True
    
    bpy.ops.object.modifier_apply(modifier=decimate.name)
```

---

## 10. Complete Integration Example

```python
"""
End-to-end example: Load wireframe JSON → create curves → convert to mesh → export GLB
"""
import bpy
import json

def full_workflow(json_path: str, glb_output: str):
    # Clear scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    
    # Load analyzer output
    with open(json_path) as f:
        data = json.load(f)
    
    img_width, img_height = data['metadata']['image_size']
    bezier_curves = data['bezier_curves']
    
    # Create curves for each contour
    curve_objects = []
    for i, curve_set in enumerate(bezier_curves):
        curve_obj = create_curve_from_analyzer(
            f'Contour_{i}',
            curve_set,
            z_offset=0.0
        )
        curve_objects.append(curve_obj)
    
    # Convert to meshes
    mesh_objects = []
    for curve_obj in curve_objects:
        mesh_obj = curve_to_mesh(curve_obj)
        cleanup_mesh(mesh_obj)
        mesh_objects.append(mesh_obj)
    
    # Create and assign materials
    frame_mat = create_pbr_material('Frame', base_color=(0.1, 0.1, 0.1, 1.0), metallic=1.0)
    for mesh_obj in mesh_objects:
        assign_material(mesh_obj, frame_mat)
    
    # Validate
    all_errors = []
    for mesh_obj in mesh_objects:
        errors = validate_mesh(mesh_obj)
        all_errors.extend(errors)
    
    if all_errors:
        print("Validation errors:")
        for error in all_errors:
            print(f"  - {error}")
    else:
        print("✓ Validation passed")
    
    # Export
    if export_to_glb(glb_output, objects=mesh_objects):
        if check_export_size(glb_output):
            print(f"✓ Export complete: {glb_output}")
        else:
            print("⚠ File size warning; applying decimate...")
            for mesh_obj in mesh_objects:
                apply_decimate(mesh_obj, ratio=0.85)
            export_to_glb(glb_output, objects=mesh_objects)

# Usage
full_workflow('wireframe_analyzed.json', 'output.glb')
```

---

## 11. Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Curves look pinched | Control points too close together | Increase RDP epsilon in analyzer |
| Mesh has holes | Curve tessellation resolution too low | Increase `curve.resolution_u` |
| Export fails with "Unknown format" | Attempting to export non-Mesh object | Convert curves to mesh first |
| File too large (> 15 MB) | High polygon count, embedded textures | Apply Decimate modifier, use flat PBR colors |
| Normals inverted | Face orientation inconsistent | Run `mesh.normals_make_consistent(inside=False)` |
| Material not visible in GLB | Non-Principled shader used | Use only Principled BSDF, no procedural nodes |
| Asymmetrical lenses | Contour detection missed details | Adjust Canny thresholds, check wireframe quality |

---

## 12. Performance Considerations

- **Resolution**: `curve.resolution_u = 12–24` balances smoothness and polygon count
- **Bevel depth**: 0.0005–0.001 (0.5–1.0 mm) typical for thin wires; larger = more vertices
- **Subdivision**: Apply only if final model < 5000 verts before subdividing
- **Export**: GLB binary format is ~30% smaller than glTF text + separate bin

---

**Date Created**: 2026-04-27  
**Status**: Ready for skill integration  
**Next**: Create SKILL.md with decision logic and Claude MCP orchestration
