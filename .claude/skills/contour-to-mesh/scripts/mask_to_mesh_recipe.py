#!/usr/bin/env python3
"""Create a contour-derived mesh recipe and optional Blender script from an image mask.

Triangulation uses scipy.spatial.Delaunay when available; triangles whose centroid falls
outside the mask are discarded. This produces source-locked front X/Z meshes suitable for
shallow mascot/logo relief modeling.
"""
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import cv2
import numpy as np
try:
    from scipy.spatial import Delaunay
except Exception:
    Delaunay = None

def mask_from_image(path, mode):
    img=cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None: raise RuntimeError(f'cannot read {path}')
    if img.ndim==3 and img.shape[2]==4 and mode in ('auto','alpha'):
        m=(img[:,:,3]>8).astype('uint8')*255
    else:
        gray=cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2GRAY) if img.ndim==3 else img
        if mode=='edges': m=cv2.Canny(cv2.GaussianBlur(gray,(3,3),0),40,120)
        elif mode=='dark_on_bright': _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
        else: _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    return m

def recipe(path, name, world_width, samples, mode):
    m=mask_from_image(path, mode)
    h,w=m.shape
    contours,_=cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours=sorted(contours, key=cv2.contourArea, reverse=True)
    if not contours: raise RuntimeError('no contours found')
    c=contours[0]
    eps=0.0025*cv2.arcLength(c, True)
    c=cv2.approxPolyDP(c, eps, True).reshape(-1,2)
    # interior grid points
    pts=[tuple(map(float,p)) for p in c]
    step=max(4, int(min(w,h)/samples))
    for y in range(0,h,step):
        for x in range(0,w,step):
            if cv2.pointPolygonTest(c.astype('float32'), (float(x),float(y)), False) >= 0:
                pts.append((float(x),float(y)))
    # unique
    seen=set(); u=[]
    for p in pts:
        k=(round(p[0],3), round(p[1],3))
        if k not in seen:
            seen.add(k); u.append(p)
    pts_np=np.array(u, dtype='float64')
    if Delaunay is None:
        raise RuntimeError('scipy is required for triangulation: pip install scipy')
    tri=Delaunay(pts_np)
    faces=[]
    for simplex in tri.simplices:
        cp=pts_np[simplex].mean(axis=0)
        if cv2.pointPolygonTest(c.astype('float32'), (float(cp[0]),float(cp[1])), False) >= 0:
            faces.append([int(i) for i in simplex])
    scale=world_width/float(w)
    verts=[]
    for x,y in pts_np:
        verts.append([(x-w/2)*scale, 0.0, (h/2-y)*scale])
    return {'name':name,'source':str(path),'image_size':[int(w),int(h)],'world_width':world_width,'vertices':verts,'faces':faces,'boundary_point_count':int(len(c))}

def blender_script(r):
    return f"""import bpy\nfrom mathutils import Vector\nname={r['name']!r}\nverts={r['vertices']!r}\nfaces={r['faces']!r}\nmesh=bpy.data.meshes.new(name+'Mesh')\nmesh.from_pydata(verts, [], faces)\nmesh.update()\nobj=bpy.data.objects.new(name, mesh)\nbpy.context.collection.objects.link(obj)\n# front-projected UVs from X/Z bounds\nuv=mesh.uv_layers.new(name='UV_front_projected')\nxs=[v.co.x for v in mesh.vertices]; zs=[v.co.z for v in mesh.vertices]\nminx,maxx=min(xs),max(xs); minz,maxz=min(zs),max(zs); dx=max(maxx-minx,1e-8); dz=max(maxz-minz,1e-8)\nfor poly in mesh.polygons:\n    for li in poly.loop_indices:\n        co=mesh.vertices[mesh.loops[li].vertex_index].co\n        uv.data[li].uv=((co.x-minx)/dx,(co.z-minz)/dz)\nbpy.context.view_layer.objects.active=obj\nobj.select_set(True)\nbpy.ops.object.shade_smooth()\nprint('created_contour_mesh', name, 'verts', len(mesh.vertices), 'faces', len(mesh.polygons))\n"""

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--blender-script')
    ap.add_argument('--world-width', type=float, default=3.0)
    ap.add_argument('--samples', type=int, default=60)
    ap.add_argument('--mode', default='auto', choices=['auto','alpha','edges','bright_on_dark','dark_on_bright'])
    args=ap.parse_args()
    r=recipe(Path(args.image), args.name, args.world_width, args.samples, args.mode)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(r, indent=2), encoding='utf-8')
    if args.blender_script:
        Path(args.blender_script).write_text(blender_script(r), encoding='utf-8')
    print(args.out)
if __name__=='__main__': main()
