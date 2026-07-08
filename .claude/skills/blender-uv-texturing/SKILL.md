---
name: blender-uv-texturing
description: UV unwrap, atlas-map, project textures, use alpha decals, bake maps/lightmaps, and prepare texture-driven Blender assets for glTF/GLB export. Use whenever the user provides texture packs, texture atlases, decals, UV layouts, lightmaps, wants a texture to fit a mesh 1:1, or reports stretched/off textures. Pairs with reference-to-3d for template-accurate reconstruction and blender-materials for PBR values.
when_to_use: Texture atlas/UV/baking/lightmap/decal work in Blender; any request involving texture fit, UV islands, project-from-view, texture packs, alpha decals, or baked maps.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_object_info
---

# Blender UV Texturing

This skill fills the gap between “assign a material” and “the supplied texture pack actually fits the model.” It is mandatory for template/atlas-driven assets.

## Decision tree

```
What does the texture represent?
├── Whole object from front/reference → Project-from-View style UVs from the validation camera
├── Atlas with separate parts         → crop/map each part to its own UV island/rectangle
├── Repeating material                → generated/object coords or tiled UVs
├── Face/expression decal             → alpha material plane or projected UV island; no black background
├── Roughness/bump/normal map         → Non-Color data, correct node type
└── Lightmap                          → separate UV/lightmap channel or optional multiply helper; not emission
```

## Non-negotiable rules

1. Image textures need a material node setup to render/export; viewport UV display alone is not enough.
2. Basecolor/albedo = sRGB. Roughness, metallic, bump, normal, AO/lightmap = Non-Color.
3. Atlas textures must be mapped by region. Never apply a full atlas to every mesh part.
4. Alpha decals must use alpha-connected material settings (`BLEND`, `Alpha Hashed`, or `Alpha Clip`) and a keyed/correct PNG. Do not leave black planes.
5. For GLB, keep to exporter-recognized nodes where possible: Principled BSDF with Image Texture inputs, UVs, normals, tangents.
6. Validate with a checker texture or overlay render before final material tuning.

## Recipes

### Create front-projected UVs from world X/Z bounds

```python
import bpy

def assign_front_projected_uv(obj_name, uv_name='UV_front_projected'):
    obj = bpy.data.objects[obj_name]
    mesh = obj.data
    uv = mesh.uv_layers.get(uv_name) or mesh.uv_layers.new(name=uv_name)
    mesh.uv_layers.active = uv
    xs = [v.co.x for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    minx, maxx = min(xs), max(xs)
    minz, maxz = min(zs), max(zs)
    dx = max(maxx - minx, 1e-8)
    dz = max(maxz - minz, 1e-8)
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x - minx) / dx, (co.z - minz) / dz)
    mesh.update()
```

### Map a mesh to a rectangle in an atlas

Atlas rectangle is `[u0, v0, u1, v1]` in normalized UV coordinates. Use this after creating local 0–1 UVs.

```python
def remap_uv_rect(obj_name, rect, uv_name=None):
    obj = bpy.data.objects[obj_name]
    layer = obj.data.uv_layers.get(uv_name) if uv_name else obj.data.uv_layers.active
    u0, v0, u1, v1 = rect
    for item in layer.data:
        u, v = item.uv
        item.uv = (u0 + u * (u1-u0), v0 + v * (v1-v0))
    obj.data.update()
```

### Image texture material with correct color spaces

```python
import bpy

def image(path, colorspace):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img

def make_pbr_texture_material(name, basecolor, roughness=None, normal_or_bump=None, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image(basecolor, 'sRGB')
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha and 'Alpha' in bsdf.inputs:
        nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.blend_method = 'BLEND'
    if roughness:
        r = nt.nodes.new('ShaderNodeTexImage')
        r.image = image(roughness, 'Non-Color')
        nt.links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
    if normal_or_bump:
        btex = nt.nodes.new('ShaderNodeTexImage')
        btex.image = image(normal_or_bump, 'Non-Color')
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.02
        nt.links.new(btex.outputs['Color'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat
```

### Bake target setup

Blender baking requires a UV map and an active Image Texture node or color attribute as the bake target. Use Cycles for baking.

```python
import bpy

obj = bpy.data.objects['GEO-target']
bpy.context.scene.render.engine = 'CYCLES'
img = bpy.data.images.new('BAKE_target', 2048, 2048, alpha=True)
mat = obj.data.materials[0]
mat.use_nodes = True
node = mat.node_tree.nodes.new('ShaderNodeTexImage')
node.image = img
mat.node_tree.nodes.active = node
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=16)
img.filepath_raw = '/tmp/bake_target.png'
img.file_format = 'PNG'
img.save()
```

## Closed/extruded surface coverage gate

For closed or extruded assets, do not stop at front projection. Use `closed-surface-uv-coverage` to verify front cap, back cap, and sidewall material/UV/generated coverage separately. Back/side curve overlays are accents, not texture fill.

## Validation checklist

- [ ] UV layer exists and is active.
- [ ] Checker texture shows no obvious stretching on front-facing parts.
- [ ] Atlas rectangles are per-part, not whole-atlas everywhere.
- [ ] Roughness/bump/normal/lightmap color spaces are Non-Color.
- [ ] Alpha material has blend mode set and no black backing plane.
- [ ] Base GLB embeds/exports expected images and excludes reference planes.
- [ ] A front overlay render confirms the texture aligns with the source template.

## Sources distilled

- Blender Manual: UV/Image texture workflow requires material nodes for rendered texture output.
- Blender Manual: Image Texture node uses active UV map when Vector is unconnected.
- Blender Manual: Cycles baking requires a UV map and active Image Texture/Color Attribute target.
- Blender Manual: glTF exporter supports meshes, UVs, textures, and materials based mainly on Principled BSDF.
- Khronos glTF PBR: base color, metallic/roughness, normals and related maps are core concepts for realtime transfer.
