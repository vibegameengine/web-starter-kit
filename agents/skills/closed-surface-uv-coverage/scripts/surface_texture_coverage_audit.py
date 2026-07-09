#!/usr/bin/env python3
"""Audit Blender mesh surface texture coverage.

Run inside Blender with --python or via MCP execute. Outputs JSON to stdout or --out.
It intentionally treats curves/planes named as overlays as accents, not surface coverage.
"""
import argparse, json, sys
try:
    import bpy
except Exception as e:
    print(json.dumps({'error':'This script must run inside Blender Python','detail':str(e)}))
    sys.exit(1)


def material_images(mat):
    if not (mat and mat.use_nodes):
        return []
    out=[]
    for n in mat.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeTexImage' and getattr(n, 'image', None):
            out.append(n.image.filepath or n.image.name)
    return out


def audit_object(obj):
    item={
        'name': obj.name,
        'type': obj.type,
        'parent': obj.parent.name if obj.parent else None,
        'uv_layers': [],
        'materials': [],
        'face_material_counts': {},
        'warnings': [],
    }
    if obj.type != 'MESH':
        item['warnings'].append('Not a mesh surface; counts as overlay/accent unless converted/assigned to surface.')
        return item
    mesh=obj.data
    item['uv_layers']=[uv.name for uv in mesh.uv_layers]
    if not item['uv_layers']:
        item['warnings'].append('Mesh has no UV layers.')
    for p in mesh.polygons:
        k=str(p.material_index)
        item['face_material_counts'][k]=item['face_material_counts'].get(k,0)+1
    for idx,mat in enumerate(mesh.materials):
        imgs=material_images(mat)
        item['materials'].append({'slot':idx,'name':mat.name if mat else None,'image_nodes':imgs,'uses_nodes':bool(mat and mat.use_nodes)})
    textured_slots={m['slot'] for m in item['materials'] if m['image_nodes']}
    used_slots={int(k) for k in item['face_material_counts']}
    for slot in sorted(used_slots):
        if slot not in textured_slots:
            item['warnings'].append(f'Material slot {slot} is used by faces but has no image texture node; verify procedural/generated coverage is intentional.')
    return item


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--objects', nargs='*', help='Object names to audit; default: all AVATAR_BASE__/SIDE_BACK__ objects')
    ap.add_argument('--out')
    args=ap.parse_args()
    if args.objects:
        objs=[bpy.data.objects[n] for n in args.objects if n in bpy.data.objects]
    else:
        objs=[o for o in bpy.context.scene.objects if o.name.startswith(('AVATAR_BASE__','SIDE_BACK__'))]
    report={'schema':'surface_texture_coverage_audit.v1','objects':[audit_object(o) for o in objs], 'summary':{}}
    warnings=[]
    for o in report['objects']:
        for w in o.get('warnings',[]):
            warnings.append({'object':o['name'],'warning':w})
    report['summary']={'objects':len(report['objects']),'warnings':len(warnings),'warning_items':warnings}
    txt=json.dumps(report,indent=2)
    if args.out:
        open(args.out,'w').write(txt)
    print(txt)

if __name__=='__main__':
    main()
