# Modeling — Pro Knowledge Overview

**Domain**: 01 — Mesh primitives, mesh ops, hard-surface workflow  
**Status**: Initial pass complete  
**Last update**: 2026-04-27

---

## The two APIs Blender gives you

| API | Use | Best for |
|-----|-----|----------|
| **`bpy.ops.mesh`** | Operator commands (Edit Mode toolbox) | Driving Blender as a user would: add, extrude, bevel, loop cut |
| **`bmesh`** | Direct mesh data manipulation | Custom tools, batch operations, performance-critical code |

**Rule**: Reach for `bmesh` when you need precision (knowing exactly which face/edge/vertex you affected) or performance (no operator overhead). Reach for `bpy.ops.mesh` when the operation matches a user-facing tool.

---

## Mesh primitives (the starting points)

```python
import bpy

# Cube — the workhorse for hard-surface
bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 0))

# Plane — for ground, walls, decals
bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0, 0, 0))

# UV Sphere — for round things; good UVs by default
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0)

# Ico Sphere — for organic / sculpting base; uniform triangles
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)

# Cylinder — for pipes, columns, posts
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.0, depth=2.0)

# Cone — for spikes, hats
bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1.0, radius2=0.0, depth=2.0)

# Torus — for rings, donuts, tires
bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.25, major_segments=48, minor_segments=12)

# Monkey ('Suzanne') — for placeholder / testing
bpy.ops.mesh.primitive_monkey_add()
```

**Pro choice**:
- **Cube** → hard-surface (boxes, vehicles, weapons, architecture)
- **Ico Sphere** → organic / sculpting (best uniform triangulation)
- **UV Sphere** → round objects you'll texture (built-in good UVs)
- **Cylinder** → mechanical (gears, pipes, fasteners)

---

## Edit Mode operators (the hard-surface toolbox)

### Extrude — push selection along normal
```python
import bpy

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
# ... select faces ...
bpy.ops.mesh.extrude_region_move(
    TRANSFORM_OT_translate={'value': (0, 0, 1.0)}
)
```

**Pro variants**:
- `extrude_faces_indiv` — extrude each face individually (independent results)
- `extrude_edges_indiv` — extrude edges
- `extrude_repeat` — extrude N times in a row

### Inset — shrink selection inward (keeps face count)
```python
bpy.ops.mesh.inset(thickness=0.05, depth=0)        # flat inset
bpy.ops.mesh.inset(thickness=0.05, depth=-0.02)    # inset + push down (panel cut)
bpy.ops.mesh.inset_individual(thickness=0.02)      # each face independently
```

### Bevel — round/chamfer edges
```python
bpy.ops.mesh.bevel(
    offset_type='OFFSET',
    offset=0.05,
    segments=3,         # smoothness
    profile=0.5,        # 0.5 = round; 0 = concave; 1 = convex bulge
    affect='EDGES',
)
```

**Bevel is the #1 hard-surface tool**. Beveled edges = realism. Hard, sharp 90° angles = "videogame from 2001."

### Loop Cut — add edge loops
```python
bpy.ops.mesh.loopcut_slide(
    MESH_OT_loopcut={'number_cuts': 1, 'edge_index': 0},
    TRANSFORM_OT_edge_slide={'value': 0.0},
)
```

### Knife — cut precise lines
Best done interactively; programmatically use `mesh.knife_project` for projecting cuts from a curve/mesh onto another.

### Bridge Edge Loops — connect two edge loops with faces
```python
bpy.ops.mesh.bridge_edge_loops()    # used for lofting after manual setup
```

---

## bmesh — the precision API

For when you need to know exactly which element you're touching:

```python
import bpy
import bmesh

obj = bpy.data.objects['GEO-cube']
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode='EDIT')

# Get bmesh wrapper
bm = bmesh.from_edit_mesh(obj.data)

# Iterate over geometry
for v in bm.verts:
    if v.co.z > 0.5:
        v.co.z += 0.1   # push top vertices up

# Apply changes
bmesh.update_edit_mesh(obj.data)
```

**Common bmesh.ops** (precision Edit-Mode equivalents):
- `bmesh.ops.bevel` — bevel specific edges
- `bmesh.ops.extrude_face_region` — extrude specific faces
- `bmesh.ops.subdivide_edges` — loop cut programmatically
- `bmesh.ops.dissolve_edges` — remove edges (keep faces)
- `bmesh.ops.delete` — remove specific elements
- `bmesh.ops.contextual_create` — bridge / fill / face from selection

**Pro tip**: bmesh in Object Mode (read/write through `mesh.from_pymesh()` or `bmesh.new()` + load) avoids mode-switching costs in batch scripts.

---

## Hard-surface modeling: the "Bevel + SubSurf" pattern

The single most useful pattern for realistic non-organic models:

```
Base mesh (low poly, all quads, key edges marked sharp)
   ↓
Bevel modifier (limited to "Weight" or "Angle")
   ↓
Subdivision Surface modifier (level 2)
   ↓
Final smooth-with-creases mesh
```

```python
import bpy

obj = bpy.data.objects['GEO-frame']

# 1. Add Bevel modifier
bevel = obj.modifiers.new('Bevel', type='BEVEL')
bevel.width = 0.02
bevel.segments = 3
bevel.limit_method = 'WEIGHT'   # only bevel edges with bevel weight > 0

# 2. Add Subdivision Surface AFTER bevel
subdiv = obj.modifiers.new('SubSurf', type='SUBSURF')
subdiv.levels = 2
subdiv.render_levels = 3
```

**Critical**: Bevel BEFORE SubSurf. Reverse this and you get pinching.

**Mark sharp edges in Edit Mode** (so Bevel knows where to act):
```python
# Mark seam edges as bevel-weight 1.0
bpy.ops.object.mode_set(mode='EDIT')
# ... select edges ...
bpy.ops.transform.edge_bevelweight(value=1.0)
```

---

## Boolean operations (the "cut, join, split" toolkit)

Boolean modifier creates Union, Difference, or Intersection of two meshes.

```python
import bpy

target = bpy.data.objects['GEO-base']
cutter = bpy.data.objects['GEO-hole']

bool_mod = target.modifiers.new('Boolean', type='BOOLEAN')
bool_mod.operation = 'DIFFERENCE'   # 'UNION', 'DIFFERENCE', 'INTERSECT'
bool_mod.object = cutter
bool_mod.solver = 'EXACT'           # 'FAST' (older) or 'EXACT' (better topology)

# Optional: hide cutter from render
cutter.hide_render = True
cutter.hide_viewport = True
```

**Pro pitfalls**:
- ❌ Boolean creates n-gons — bad for SubSurf (use after applying SubSurf, or clean up topology after).
- ❌ Bool on highly subdivided mesh = slow + bad topology. Boolean before SubSurf, or use simpler cutter geometry.
- ❌ Cutter mesh must be *closed* (no holes); check normals.
- ✅ "Exact" solver: cleaner results, slower. "Fast": faster, may produce artifacts.

---

## Mesh modifiers (key ones)

| Modifier | Purpose | Place in stack |
|----------|---------|----------------|
| **Mirror** | Symmetric modeling (only model half) | First |
| **Array** | Linear/spiral repetition | Early |
| **Bevel** | Round edges | After Mirror, before SubSurf |
| **Solidify** | Give thickness to flat surfaces | After base modeling |
| **Subdivision Surface** | Smooth/refine | Late stack |
| **Boolean** | Cut/combine | Where the cut happens |
| **Decimate** | Polygon reduction | Last (export-only) |
| **Triangulate** | Force triangles | For game engines |
| **Edge Split** | Force sharp edges in shading | Where sharp is needed |

**Standard hard-surface stack order**:
```
Mirror → Array → Solidify → Bevel → Subdivision Surface → (Boolean if needed)
```

---

## Common pitfalls

| Mistake | Why | Fix |
|---------|-----|-----|
| Square corners on every model | "Default Cube look" | Always add Bevel; default 0.02m, 3 segments |
| SubSurf on unbevelled mesh | Mesh becomes blob | Bevel first (or mark crease edges) |
| N-gons after Boolean | Subsurf pinches | Apply Bool, clean up to quads, then SubSurf |
| Inverted normals | Black faces in render | `Mesh → Normals → Recalculate Outside` |
| Symmetry breaks (left ≠ right) | Mirror modifier wasn't applied/used | Use Mirror modifier with X clipping enabled |
| Mesh has hidden geometry | Internal faces from extrude mistakes | Select all → `Mesh → Clean Up → Delete Loose` |
| Too many vertices for game engine | Game LODs limited | Decimate modifier or manual retopology |

---

## bpy.ops.mesh full reference

The **most useful** operators (out of ~100):

- `primitive_*_add` — primitives
- `select_all`, `select_linked`, `select_more`, `select_less`
- `extrude_region_move`, `extrude_faces_move`, `extrude_edges_move`
- `inset`, `inset_individual`
- `bevel`
- `loopcut_slide`
- `knife_project`, `bisect`
- `subdivide`
- `merge` (vertices), `remove_doubles`
- `bridge_edge_loops`
- `flip_normals`, `normals_make_consistent`
- `mark_seam`, `mark_sharp`, `mark_freestyle_edge`
- `delete`, `dissolve_edges`, `dissolve_verts`, `dissolve_faces`
- `fill`, `fill_grid` (auto-fill holes)
- `screw` (lathe-like operator)
- `spin` (rotate-extrude)

Full reference: [bpy.ops.mesh — Blender Python API](https://docs.blender.org/api/current/bpy.ops.mesh.html)

---

## Sources

- [BMesh — Blender Developer Documentation](https://developer.blender.org/docs/features/objects/mesh/bmesh/)
- [Mesh Primitives — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/modeling/meshes/primitives.html)
- [BMesh Operators (bmesh.ops) — Blender Python API](https://docs.blender.org/api/current/bmesh.ops.html)
- [Mesh Operators — Blender Python API](https://docs.blender.org/api/current/bpy.ops.mesh.html)
- [Jeremy Behreandt — Shaping Models with BMesh](https://behreajj.medium.com/shaping-models-with-bmesh-in-blender-2-9-2f4fcc889bf0)
- [Sinestesia — Extruding Meshes with BMesh](https://sinestesia.co/blog/tutorials/extruding-meshes-with-bmesh/)
- [Polycount — MESHmachine hard-surface addon](https://polycount.com/discussion/205933/blender-meshmachine-hard-surface-focused-mesh-modeling)

---

## Outstanding

- [ ] Specific hard-surface recipes: weapons, vehicles, mechanical parts
- [ ] Boolean cleanup workflow (n-gon to quad conversion)
- [ ] Procedural greebles + panel lines via Geometry Nodes
- [ ] Topology surgery: merging meshes, joining loops, fixing flow
