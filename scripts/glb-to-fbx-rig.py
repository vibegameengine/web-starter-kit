# Convert a game GLB to a Mixamo-ready FBX (Blender, headless).
#
# Produces an FBX for auto-rigging in Mixamo: human scale (~1.7 m -> 170 FBX units),
# feet at the origin, embedded textures, single joined mesh. It does NOT touch normals
# — the GLB's authored normals are kept as-is (a normal recompute here only introduced
# flipped-face specks). Any dark-shoulder shading you see in an FBX viewer is a
# NORMAL-MAP/FBX preview artifact, NOT geometry damage — Mixamo rigs geometry and
# ignores it, and it disappears when you re-export FBX->GLB after rigging.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/glb-to-fbx-rig.py -- <in.glb> <out.fbx> [height_m=1.7]
#
# See reference-to-3d SKILL.md "Rigging: Mixamo round-trip" for the full pipeline.

import bpy, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
TARGET_H = float(argv[2]) if len(argv) > 2 else 1.7

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)            # keeps authored normals
bpy.ops.file.unpack_all(method='WRITE_LOCAL')       # so embed_textures can pick them up

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects:
    o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active

# scale to human height (tallest dimension -> TARGET_H metres; FBX export *100 => ~170 units)
h = max(obj.dimensions)
f = TARGET_H / h if h > 0 else 1.0
obj.scale = (f, f, f)
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# recentre to FEET: Blender is Z-up -> feet at min world Z, centre X/Y
cw = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
minz = min(c.z for c in cw)
midx = (min(c.x for c in cw) + max(c.x for c in cw)) / 2
midy = (min(c.y for c in cw) + max(c.y for c in cw)) / 2
obj.location.x -= midx; obj.location.y -= midy; obj.location.z -= minz
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

bpy.ops.export_scene.fbx(filepath=OUT, use_selection=True, path_mode='COPY',
                         embed_textures=True, add_leaf_bones=False, object_types={'MESH'})
print("FBX WROTE", OUT, "dims(m)", tuple(round(d, 3) for d in obj.dimensions))
