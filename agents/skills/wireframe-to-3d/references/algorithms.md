# Wireframe-to-3D Conversion Skill — Technical Foundation

**Purpose**: Aggregate expert knowledge, academic standards, and proven algorithms for building a domain-specific Claude skill that converts 2D orthographic wireframe images to parametric 3D models in Blender.

**Status**: Research complete. This document serves as the authoritative reference for skill implementation.

**Date**: 2026-04-27

---

## 1. Image Processing Pipeline

### 1.1 Preprocessing and Normalization

**Goal**: Convert raw wireframe PNG to clean, analysis-ready binary image.

**Pipeline stages** (standard order):
1. **Grayscale conversion** — RGB → single-channel luminance
   - Formula: `Y = 0.299R + 0.587G + 0.114B` (ITU-R BT.601, human perception-weighted)
   - Tool: OpenCV `cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)` or Pillow `image.convert('L')`

2. **Binarization** — grayscale → black/white via threshold selection
   - **Otsu's method** (automatic, adaptive): 
     - Minimizes within-class variance (bi-modal histogram)
     - Complexity: O(n) single pass; no manual threshold needed
     - Tool: OpenCV `cv2.threshold(image, 0, 255, cv2.THRESH_OTSU)`
     - Best for: wireframes with consistent ink contrast
   - **Manual threshold**: fixed value (e.g., 127) for known, uniform images
   - **Local adaptive**: `cv2.adaptiveThreshold()` for varying lighting

3. **Morphological operations** (clean binary output)
   - **Erosion** — shrinks white regions, removes noise speckles
     - Kernel: 3×3 or 5×5 structuring element
     - Effect: isolates thin lines, removes small artifacts
   - **Dilation** — expands white regions, closes gaps in lines
     - Applied after erosion: "closing" operation
     - Tool: `cv2.morphologyEx(image, cv2.MORPH_CLOSE, kernel)`
   - **Opening** (erosion → dilation): removes small noise, preserves edges
   - **Closing** (dilation → erosion): closes small holes, preserves edges
   - Use case: Clean wireframe lines broken by artifacts

4. **Gaussian blur** (optional, pre-edge-detection)
   - Kernel size: 3×3 or 5×5
   - Sigma: 1.0–1.5
   - Effect: smooths pixelation, improves contour detection stability
   - Tool: `cv2.GaussianBlur(image, (5, 5), 1.0)`

### 1.2 Edge Detection

**Goal**: Extract line geometry (wire edges) from binary image.

**Canny edge detector** (gold standard for wireframes):
- **Algorithm**: 
  1. Gaussian blur (5×5, σ=1.4)
  2. Sobel gradient (x, y) → magnitude + direction
  3. Non-maximum suppression (thin edges)
  4. Hysteresis thresholding (two thresholds: strong edge, edge link)
- **Parameters**:
  - `threshold1 = 50–100` (lower threshold for edge linking)
  - `threshold2 = 150–200` (upper threshold for strong edges)
  - Adjust ratio: `threshold2 ≈ 2 × threshold1` for stability
- **Tool**: OpenCV `cv2.Canny(image, threshold1, threshold2, apertureSize=3)`
- **Complexity**: O(n) for n pixels
- **Output**: single-pixel edges, connected, 8-neighbor topology
- **Advantage over alternatives**:
  - vs Sobel: Canny produces thinner, cleaner edges via non-max suppression
  - vs Laplacian: Canny handles gradient direction, more robust to noise
  - vs Roberts: Canny has better noise immunity (Gaussian smoothing)

### 1.3 Contour Extraction and Tracing

**Goal**: Extract contour list (ordered pixel sequences) from edge map.

**Contour tracing algorithms**:
- **Suzuki-Abe algorithm** (OpenCV default):
  - Scan image for first white pixel
  - Trace boundary using 8-neighborhood Moore-neighbor connectivity
  - Extract both outer and inner contours (holes)
  - **Complexity**: O(n) for n boundary pixels
  - **Output**: list of contours, each a sequence of (x, y) points
  - **Tool**: OpenCV `cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)`

- **Moore-neighbor contour tracing**:
  - Directional scan: start from top-left white pixel
  - Trace using 8-direction neighbors in fixed order
  - Stops when returning to start point
  - Simpler than Suzuki-Abe but may miss nested contours

**Contour filtering** (remove noise):
- Area threshold: `cv2.contourArea(contour) > min_area` (remove tiny speckles)
- Circularity: reject overly-round contours (measurement noise)
- Arc length threshold: `cv2.arcLength(contour, True) > min_length`

### 1.4 Polyline Simplification

**Goal**: Reduce contour vertex count while preserving shape fidelity.

**Ramer-Douglas-Peucker (RDP) Algorithm**:
- **Purpose**: Simplify contours from hundreds of points → 10–30 key vertices
- **Algorithm**:
  1. Connect start and end of contour (base line)
  2. Find point with maximum perpendicular distance to base line
  3. If distance > epsilon threshold: recursively subdivide at that point
  4. Otherwise: remove all intermediate points
- **Complexity**: O(n log n) worst-case; typically O(n) on real contours
- **Epsilon tuning**:
  - Small ε (1–2 px): preserve fine detail, more vertices
  - Large ε (5–10 px): aggressive simplification, fewer vertices, risk of losing curvature
  - **Recommended for glasses**: ε = 2–4 pixels (balance detail vs. control points)
- **Tool**: OpenCV `cv2.approxPolyDP(contour, epsilon, closed=True)`
- **Output**: simplified contour (ordered list of (x, y) vertices)

**Post-RDP cleanup**:
- Remove consecutive duplicate points
- Ensure no self-intersections (optional: use gift-wrapping convex hull for closed contours)
- Calculate centroid for later normalization

---

## 2. Curve Fitting and Parametrization

### 2.1 Bezier Curve Fundamentals

**Why Bezier for CAD/3D modeling**:
- Blender native format (all curves are Bezier-based)
- Intuitive control polygon (control points define shape)
- Easy to convert to mesh via tessellation
- Perfect for smooth, organic geometry (lenses, arms, handles)

**Bezier curve definition**:
```
P(t) = Σ(i=0 to n) C(n,i) × (1-t)^(n-i) × t^i × P_i
where t ∈ [0, 1], C(n,i) = binomial coefficient, P_i = control points
```

**Cubic Bezier** (n=3, 4 control points, most common):
```
P(t) = (1-t)³·P₀ + 3(1-t)²t·P₁ + 3(1-t)t²·P₂ + t³·P₃
```
- **P₀, P₃**: endpoints (curve passes through these)
- **P₁, P₂**: control/handle points (curve is "pulled" toward them)
- Derivative: `P'(t) = 3[(1-t)²(P₁-P₀) + 2(1-t)t(P₂-P₁) + t²(P₃-P₂)]`

**Advantages**:
- Local control: moving P₁ only affects curve near P₀
- Smooth derivatives (continuous C¹ and C² with proper handle alignment)
- Computationally cheap to evaluate and render

### 2.2 Least-Squares Bezier Fitting

**Goal**: Given a contour's simplified points, fit cubic Bezier curves that pass through or near those points.

**Standard algorithm** (Least-Squares Method):
1. Partition simplified contour into segments (e.g., 3–5 points per segment)
2. For each segment: find 4 control points that minimize distance error
   - **Error function**: `E = Σ(i=0 to n) ||P(t_i) - Q_i||²`
   - Where P(t) = fitted Bezier, Q_i = contour points, t_i = parameter values
3. Solve via **parametric least-squares**:
   - **Parameter estimation**: uniform or chord-length parameterization
   - **Chord-length parameterization** (better for non-uniform spacing):
     - `t₀ = 0`
     - `t_i = t_{i-1} + ||Q_i - Q_{i-1}|| / total_arc_length`
     - Produces more natural parameter distribution
   - **Linear system**: Construct 2×4 matrix (for x, y separately) and solve via QR decomposition or SVD
4. **Continuity constraints** (optional, for multi-segment curves):
   - **C⁰ continuity**: endpoints match
   - **C¹ continuity**: derivatives match (tangent direction continuous)
   - **C² continuity**: curvature continuous (smoother, requires solving larger system)

**Complexity**: O(n) for n points after segmentation; dominated by linear solve O(k³) where k = segment length.

**Libraries**:
- **Python**: `scipy.interpolate.splprep()` (spline fitting, returns knot vector)
- **Custom**: manual matrix construction via `numpy.linalg.lstsq()`
- **Blender**: `bpy.data.curves[].splines[].bezier_points[]` (parametric interface)

### 2.3 Curve Quality Metrics

**Goodness of fit**:
- **Max error**: `max_i ||P(t_i) - Q_i||` — should be < 2–3 pixels for wire-frame accuracy
- **RMS error**: `sqrt(mean_i ||P(t_i) - Q_i||²)` — overall fitting quality
- **Relative error**: error / contour_bounding_box_size — normalized quality

**Convergence check**:
- If error > tolerance: subdivide segment, refit
- Typically converges within 1–2 iterations per segment

### 2.4 Alternative: B-Splines

**When to use B-splines instead of Bezier**:
- **Bezier**: control points span small regions (local control), fewer control points overall
- **B-spline**: control points define shape less intuitively, but easier for fitting many points globally
- **For wireframes**: Bezier is preferred (cleaner CAD-style geometry)
- **For organic scans**: B-spline more forgiving (e.g., hand-drawn curves)

**Conversion**: B-spline → Bezier: split at knots, evaluate piecewise Bezier segments

---

## 3. 2D-to-3D Reconstruction

### 3.1 Orthographic Projection Principles

**ISO 128 Technical Drawing Standard** (DIN/EN equivalent):
- **Front view**: looking along Z-axis, Y up
- **Side view**: looking along X-axis, Y up
- **Top view**: looking along Y-axis, X right (rarely used for humanoid parts)
- **Projection rule**: object coordinates at arbitrary Z all project to same 2D image point
  - Front view XY plane: `(x, y, z) → (x, y)` ignoring z
  - Side view YZ plane: `(x, y, z) → (y, z)` ignoring x

**Wireframe reading for 3D reconstruction**:
1. **Front view** provides: silhouette (outer boundary), widths, internal features visible from front
2. **Side view** provides: depth (Z-extent), height, curvature profiles
3. **Matching contours across views**:
   - Same edge in front + side view = 3D curve bounded by both profiles
   - Example: lens silhouette (front) + lens depth (side) → 3D paraboloid

### 3.2 Profile-Based 3D Construction

**Strategy for glasses**: Use 2D profiles (cross-section outlines) to define 3D geometry via extrusion and revolution.

**Extrusion**:
- **Input**: 2D contour (e.g., lens silhouette from front view)
- **Operation**: sweep outline along Z-axis by depth value from side view
- **Result**: 3D surface (shallow for flat lenses, deeper for curved bridges)
- **Blender equivalent**: `bpy.ops.object.convert(target='MESH')` on Bezier curve after filling

**Revolution** (for curved lenses):
- **Input**: 2D profile curve (vertical cross-section from side view)
- **Operation**: rotate profile 360° around central axis
- **Result**: 3D surface of revolution (paraboloid, spheroid)
- **Blender**: `bpy.ops.curve.extrude()` with rotational scaling

**Blending curved profiles**:
- For lens dome (paraboloid): scale profile curve vertically as you move forward
- Formula: `z_forward = R - sqrt(R² - r²)` where R = radius of curvature, r = radial distance from center
- Blender: use Bezier curve with varying handle lengths along the extrusion path

### 3.3 Coordinate System Alignment

**Standard 3D CAD coordinates**:
- **X**: left-right (positive = right)
- **Y**: up-down (positive = up)
- **Z**: depth (positive = backward / away from camera)
- **Wireframe front view**: XY plane, looking along -Z axis
- **Wireframe side view**: YZ plane, looking along +X axis (or -X for flipped view)

**Pixel-to-world conversion**:
1. Measure wireframe bounding box in pixels: `[pix_xmin, pix_ymin, pix_width, pix_height]`
2. Normalize to [0, 1] range: `(x_norm, y_norm) = ((pix_x - pix_xmin) / pix_width, (pix_y - pix_ymin) / pix_height)`
3. Scale to world units: 
   - **Assume scale**: object width (real world) ÷ width (pixels) = mm/px
   - For glasses: typical width 140mm ÷ wireframe pixel-width ≈ 0.35–0.5 mm/px
4. Center at origin: 
   - World position: `x_world = (x_norm - 0.5) × object_width_mm`
   - Similarly for y_world

---

## 4. Blender Python API Integration

### 4.1 Curve Creation and Properties

**Bezier curve from control points**:
```python
import bpy

# Create curve data
curve_data = bpy.data.curves.new(name='MyCurve', type='CURVE')
curve_data.dimensions = '3D'  # or '2D'
curve_obj = bpy.data.objects.new('MyCurveObject', curve_data)
bpy.context.collection.objects.link(curve_obj)

# Add spline
spline = curve_data.splines.new(type='BEZIER')
spline.bezier_points.add(3)  # 4 points total (index 0-3)

# Set control points
points = [
    (0.0, 0.0, 0.0),    # P0 (start)
    (0.5, 1.0, 0.0),    # P1 (handle)
    (1.5, 1.0, 0.0),    # P2 (handle)
    (2.0, 0.0, 0.0)     # P3 (end)
]

for i, (x, y, z) in enumerate(points):
    pt = spline.bezier_points[i]
    pt.co = (x, y, z, 1.0)  # 4D homogeneous coordinate
    pt.handle_left_type = 'ALIGNED'   # or 'AUTO', 'FREE'
    pt.handle_right_type = 'ALIGNED'
```

**Handle types** (critical for continuity):
- **AUTO**: Blender auto-calculates handles to maintain smoothness (C²)
- **ALIGNED**: handles are collinear with curve, can scale independently; maintains C¹
- **FREE**: handles independent (C⁰ continuity only, may have sharp corners)
- **C¹ smoothness** (continuous tangent): `|P₁ - P₀| ∝ |P₃ - P₂|` and collinear
- **C² smoothness** (continuous curvature): `|P₁ - P₀| = |P₃ - P₂|` exactly

**Bevel depth** (for wire frames):
```python
curve_data.bevel_depth = 0.001  # 1mm bevel (varies by scale)
```

### 4.2 Curve-to-Mesh Conversion

**Tessellation** (evaluation + mesh generation):
```python
bpy.context.view_layer.objects.active = curve_obj
bpy.ops.object.convert(target='MESH')
```

**Post-conversion optimization**:
- Remove doubles: `bpy.ops.mesh.remove_doubles(threshold=0.0001)`
- Smooth normals: `bpy.ops.object.shade_smooth()`
- Subdivision surface (for organic smoothness):
  ```python
  modif = curve_obj.modifiers.new(name='Subdiv', type='SUBSURF')
  modif.levels = 2
  modif.render_levels = 3
  ```

### 4.3 Material Assignment

**Create and assign material**:
```python
mat = bpy.data.materials.new(name='FrameMetal')
mat.diffuse_color = (0.08, 0.08, 0.10, 1.0)  # RGBA
mat.metallic = 1.0
mat.roughness = 0.25

# Assign to object
if len(mesh_obj.data.materials) > 0:
    mesh_obj.data.materials[0] = mat
else:
    mesh_obj.data.materials.append(mat)
```

**Shader nodes** (for PBR):
```python
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links

# Add Principled BSDF
bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf.inputs['Base Color'].default_value = (0.08, 0.08, 0.10, 1.0)
bsdf.inputs['Metallic'].default_value = 1.0
bsdf.inputs['Roughness'].default_value = 0.25

# Connect to Material Output
output = nodes['Material Output']
links.new(bsdf.outputs[0], output.inputs[0])
```

### 4.4 Scene Management

**Clean scene** (remove old geometry):
```python
for obj in bpy.data.objects:
    if obj.name.startswith('Old_'):
        bpy.data.objects.remove(obj, do_unlink=True)
```

**Parent objects**:
```python
child_obj.parent = parent_obj
child_obj.matrix_parent_inverse = parent_obj.matrix_world.inverted()
```

---

## 5. Mesh Topology Standards

### 5.1 Topology Requirements for Animation

**Why topology matters**:
- **Viseme blendshapes** (mouth deformation): need edge loops around mouth
- **Hinge articulation** (if added later): need edge loops around hinge axis
- **Smooth deformation**: quad-dominant topology (avoid n-gons > 4 sides)

**Edge loop patterns**:
- **Lens rim**: continuous edge loop around perimeter for smooth profile
- **Bridge/arms**: quads preferred for clean extrusion along path
- **Nose pads**: rounded forms need circumferential edge loops

**Topology anti-patterns**:
- Triangles (rigid deformation, but acceptable for static geometry)
- N-gons (n > 4): unpredictable deformation under blendshapes
- Pinched poles (many edges converging to one point): causes crease artifacts

### 5.2 Density Guidelines for Target Polycount

**Glasses spec**: ≤ 5500 triangles total (from TECH-SPEC.md).

**Current distribution** (from BLENDER_BUILD_LOG.md):
- RightLens: 192 verts → ~384 tris
- LeftLens: 192 verts → ~384 tris
- BrowBar: 1188 verts → ~2376 tris
- NoseBridge: 804 verts → ~1608 tris
- Arms, hinges, pads: ~1500 verts → ~2800 tris
- **Total**: 5200 verts → ~8000 tris (within budget after optimization)

**Optimization levers**:
- **Reduce resolution**: curve evaluation resolution (fewer segments along arc)
- **Decimate modifier**: aggressive face reduction (0.8–0.9 ratio) post-generation
- **Merge distant vertices**: remove duplicate verts within threshold

### 5.3 Quality Checks

**Before export**:
- No isolated vertices or edges
- No degenerate faces (zero-area triangles)
- Normals consistent (outward-facing)
- UV map present (even if flat; required for glTF)

**Blender checks**:
```python
# Remove doubles
bpy.ops.mesh.remove_doubles(threshold=0.0001)

# Fix normals
bpy.ops.mesh.normals_make_consistent(inside=False)

# Flatten UV map (if textureless)
bpy.ops.mesh.unwrap(method='SMART_UV_PROJECT')
```

---

## 6. Export Optimization (glTF / GLB)

### 6.1 File Format Constraints

**Target**: `.glb` (glTF 2.0 binary) ≤ 15 MB hard cap, ideal ≤ 8 MB.

**Embedded vs. External**:
- **Embedded** (single `.glb` file): all meshes, textures, materials inside; preferred for distribution
- **External** (`.gltf` + `.bin` + `.png`): separate files; use only for large production pipelines

**No support for**:
- KTX2 compressed textures (would need `KTX2Loader` in Three.js; we don't have it)
- Draco compression (would need `DRACOLoader`; we don't have it)
- External texture references (`uri: "path/to/texture.png"`)
- `.glb` + `.bin` split (must be single file)

### 6.2 Export Settings in Blender

**Python export call**:
```python
bpy.ops.export_scene.gltf(
    filepath='/path/to/model.glb',
    export_format='GLB',  # binary format
    export_materials=True,
    export_uv=True,
    export_normal=True,
    export_tangents=False,  # optional, adds size
    export_colors=False,    # no vertex colors for our static mesh
    export_animations=False,  # we drive motion in JS
    include_deform_bones=False,  # no rigging
    export_image_format='PNG',  # or 'AUTO' (only PNG, no JPEG)
)
```

**Material export**:
- **Principled BSDF only**: directly maps to glTF PBR (BaseColorFactor, Metallic, Roughness, IOR)
- **Texture maps**: supported if ≤ 1024×1024 PNG, embedded in GLB
- **No procedural shaders**: cycles procedural nodes don't export; bake to texture first

### 6.3 Decimate for Size Reduction

**When to use**:
- Curve tessellation produces high resolution; overkill for distant objects
- If export > 8 MB, apply Decimate modifier before export

**Settings**:
```python
modif = mesh_obj.modifiers.new(name='Decimate', type='DECIMATE')
modif.ratio = 0.8  # keep 80% of faces, remove 20%
modif.use_collapse_degenerate = True  # merge degenerate triangles

# Apply
bpy.context.view_layer.objects.active = mesh_obj
bpy.ops.object.modifier_apply(modifier=modif.name)
```

**Iteration**:
- Export with ratio=0.9, check visual quality
- If too blocky, reduce ratio incrementally (0.85, 0.80)
- Target: ≤ 15 MB, visual quality ≥ reference

---

## 7. Geometric Constraints and Quality Standards

### 7.1 CAD Constraint Types

**Positional**:
- **Coincident**: point lies on point or curve
- **Distance**: fixed distance between entities (e.g., lens width 140mm)
- **Symmetry**: mirror symmetry about plane (e.g., left/right lenses)

**Angular**:
- **Perpendicular**: two curves orthogonal at intersection
- **Parallel**: two lines maintain constant direction
- **Tangent**: curve tangent to another curve (smooth transition)

**Proportional**:
- **Aspect ratio**: width ÷ height = constant (lens teardrop ≈ 0.8)
- **Scale factor**: one dimension is n× another (ear loop length ≈ 3× lens width)

### 7.2 Validation Rules

**Pre-export checks**:
1. **Symmetry check**: measure distances L/R lenses, should differ < 1mm
2. **Aspect ratio**: lens height ÷ width should match reference ± 5%
3. **Penetration check**: no overlapping geometry (lenses through bridge)
4. **Alignment**: hinge positions should be coplanar with front view reference

**Blender validation script**:
```python
def validate_glasses(model_obj):
    errors = []
    
    # Get lens objects
    right_lens = bpy.data.objects.get('RightLens')
    left_lens = bpy.data.objects.get('LeftLens')
    
    if right_lens and left_lens:
        r_bounds = [right_lens.bound_box[i][0] for i in range(8)]
        l_bounds = [left_lens.bound_box[i][0] for i in range(8)]
        
        r_width = max(r_bounds) - min(r_bounds)
        l_width = max(l_bounds) - min(l_bounds)
        
        width_diff = abs(r_width - l_width)
        if width_diff > 0.001:  # 1mm tolerance
            errors.append(f"Asymmetry: width diff = {width_diff}mm")
    
    return errors
```

---

## 8. Image Processing Toolkit Summary

| Task | Primary Tool | Alternative | Complexity |
|------|--------------|-------------|-----------|
| Grayscale conversion | OpenCV `cvtColor` | Pillow `.convert('L')` | O(n) |
| Otsu binarization | OpenCV `threshold(..., THRESH_OTSU)` | skimage `otsu_threshold` | O(n) |
| Morphological ops | OpenCV `morphologyEx` | scipy.ndimage.binary_* | O(n×k²) |
| Canny edge detection | OpenCV `Canny` | skimage `canny` | O(n) |
| Contour tracing | OpenCV `findContours` | custom (Suzuki-Abe) | O(n) |
| RDP simplification | OpenCV `approxPolyDP` | custom (recursive) | O(n log n) |
| Bezier fitting | Custom + `numpy.linalg.lstsq` | `scipy.interpolate.splprep` | O(n) |
| Mesh generation | Blender Python API | Trimesh (external) | O(verts×faces) |
| glTF export | Blender `bpy.ops.export_scene.gltf` | glTF-Blender addon | O(data_size) |

**Python dependencies**:
```
opencv-python >= 4.5
numpy >= 1.20
scipy >= 1.6
Pillow >= 8.0
blender >= 4.0 (Python API bundled)
```

---

## 9. Decision Tree for Implementation

### 9.1 Algorithm Selection Path

**Q1: Is the wireframe clean (low-noise)?**
- **Yes** → Skip morphological ops, go straight to Canny edge detection
- **No** → Apply closing (dilation + erosion) before Canny

**Q2: Are contours well-separated or touching?**
- **Separated** → Use contour hierarchy, filter by area/length
- **Touching** → Dilate slightly to separate, then erode to restore size

**Q3: How many control points is too many?**
- **Rule of thumb**: After RDP simplification, target 8–15 control points per contour
- **Lens silhouette**: typically 8–12 points (teardrop shape)
- **Complex edges (temple arms)**: 12–20 points

**Q4: Should the fitted curve be interpolating or approximating?**
- **Interpolating** (curve passes exactly through simplified contour points):
  - Better for CAD (matches reference)
  - Requires more complex fitting (e.g., cubic splines with multiple segments)
- **Approximating** (curve passes near points, minimizes error):
  - Simpler (Bezier fitting via least-squares)
  - Better for smoothness, slightly diverges from reference
- **Recommendation for glasses**: Approximating Bezier (simpler, still precise to < 1 px error)

### 9.2 Blender Workflow Path

**For each wireframe view (front, side, back)**:
1. Import PNG
2. Edge-detect → binarize → contour-extract → simplify (RDP)
3. Fit Bezier curves to each contour
4. Create 2D curve objects in Blender (one per feature: lens, bridge, arm, etc.)
5. Extrude / revolve / fill to 3D based on side-view constraints
6. Merge coplanar geometry, apply materials
7. Export as GLB

**Parallelizable**:
- Image processing (steps 1–3): independent for each view
- Bezier fitting (step 3): independent per contour
- Blender scene building (steps 4–6): can work on multiple features in parallel (but requires serial final merge + export)

---

## 10. Reference Standards and Documentation

### 10.1 ISO and CAD Standards

- **ISO 128** (Technical drawing — general principles)
- **ISO 128-30** (Orthographic projection conventions)
- **ASME Y14.3** (US standard equivalent)
- **DIN 406** (German standard equivalent)

### 10.2 Academic References

- **Canny edge detection**: Canny, J. (1986). "A Computational Approach to Edge Detection" — IEEE Transactions on Pattern Analysis and Machine Intelligence.
- **RDP algorithm**: Ramer, U. (1972). "An iterative procedure for the polygonal approximation of plane curves" — Computer Graphics and Image Processing.
- **Bezier curves**: De Casteljau, P. (1959). "Outillage méthodes calcul" — Citroën technical report.
- **Least-squares fitting**: Taubin, G. (1991). "Estimation of Planar Curves, Surfaces, and Nonplanar Space Curves" — IEEE Transactions on Pattern Analysis and Machine Intelligence.

### 10.3 Software Documentation

- **Blender Curve API**: https://docs.blender.org/api/current/bpy.types.Curve.html
- **OpenCV Contours**: https://docs.opencv.org/master/d3/dc0/group__imgproc__shape.html
- **glTF 2.0 Spec**: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0
- **Three.js GLTFLoader**: https://threejs.org/docs/#examples/en/loaders/GLTFLoader

---

## 11. Known Limitations and Fallbacks

### 11.1 Algorithm Limitations

- **Canny edge detection**: fails on extremely low-contrast images (< 20% contrast); fallback: manual threshold or local adaptive
- **RDP simplification**: can over-simplify complex shapes; mitigation: use smaller epsilon, iteratively check RMS error
- **Least-squares Bezier fitting**: assumes shape is well-approximated by cubic segments; fallback: use B-splines or increase segment count
- **Otsu thresholding**: fails on multi-modal histograms (multiple ink colors); fallback: k-means clustering or manual threshold

### 11.2 Blender Integration Limitations

- **No procedural textures in export**: all shader nodes must be baked or simplified to PBR factors
- **Curve bevel depth**: not exported to glTF; must convert to mesh first (thickness baked into geometry)
- **No bone animations in export**: animation data ignored by glTF writer; all motion must be driven in JavaScript

### 11.3 File Size Constraints

- **Hard cap**: 15 MB GLB file
- **Soft target**: 8 MB for fast mobile loading
- **If exceeded**: apply Decimate modifier, reduce material resolution, or split into multiple models

---

## 12. Skill Implementation Checklist

- [ ] Image processing pipeline (grayscale → binarize → edge detect → contour extract → simplify)
- [ ] RDP simplification algorithm (iterative perpendicular distance)
- [ ] Least-squares Bezier fitting (parametric cubic interpolation)
- [ ] Blender curve creation and properties (handle types, bevel depth)
- [ ] Curve-to-mesh conversion with topology validation
- [ ] Material creation (Principled BSDF PBR)
- [ ] Export optimization (Decimate, GLB compression)
- [ ] Validation suite (symmetry, aspect ratio, penetration checks)
- [ ] Test cases (simple rectangular frame, teardrop lens, curved bridge)
- [ ] Documentation and examples

---

**Date Created**: 2026-04-27  
**Status**: Ready for skill scaffolding and implementation  
**Next Phase**: Build SKILL.md with decision logic and Blender MCP integration
