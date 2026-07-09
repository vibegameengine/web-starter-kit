#!/usr/bin/env python3
"""Build a source-locked front-skin contour recipe from a canonical front image.

This is useful when the front design is the strongest source of truth and multiview sheets are
illustrative rather than CAD-consistent. The recipe preserves image-space boundary and full-image
UVs so the front render can match the source texture closely.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
import cv2
import numpy as np
try:
    from scipy.spatial import Delaunay
except Exception:
    Delaunay = None


def foreground_mask(img, mode, hue_min, hue_max, sat_min, value_min):
    if img.ndim == 3 and img.shape[2] == 4 and mode == 'alpha':
        return (img[:, :, 3] > 8).astype('uint8') * 255
    bgr = img[:, :, :3] if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    if mode == 'bright':
        return (gray > value_min).astype('uint8') * 255
    if mode == 'green_yellow':
        return ((hsv[:,:,0] >= hue_min) & (hsv[:,:,0] <= hue_max) & (hsv[:,:,1] >= sat_min) & (hsv[:,:,2] >= value_min)).astype('uint8') * 255
    if mode == 'non_dark':
        return (gray > value_min).astype('uint8') * 255
    _, m = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return m


def largest_component(m, close_iters=2, dilate_iters=0, open_ksize=0):
    if open_ksize and open_ksize > 1:
        ok = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(open_ksize), int(open_ksize)))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, ok, iterations=1)
    k = np.ones((5,5), np.uint8)
    if close_iters:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=close_iters)
    if dilate_iters:
        m = cv2.dilate(m, k, iterations=dilate_iters)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        raise RuntimeError('no foreground components')
    idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (labels == idx).astype('uint8') * 255


def make_recipe(image_path, mask, name, world_width, samples, epsilon_frac):
    h, w = mask.shape
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs:
        raise RuntimeError('no external contour')
    c = max(cs, key=cv2.contourArea)
    eps = epsilon_frac * cv2.arcLength(c, True)
    c = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
    pts = [tuple(map(float, p)) for p in c]
    step = max(4, int(min(w,h) / samples))
    c32 = c.astype('float32')
    for y in range(0, h, step):
        for x in range(0, w, step):
            if cv2.pointPolygonTest(c32, (float(x), float(y)), False) >= 0:
                pts.append((float(x), float(y)))
    seen=set(); unique=[]
    for x,y in pts:
        key=(round(x,3), round(y,3))
        if key not in seen:
            seen.add(key); unique.append((x,y))
    pts_np=np.array(unique, dtype='float64')
    if Delaunay is None:
        raise RuntimeError('scipy is required for triangulation')
    tri=Delaunay(pts_np)
    faces=[]
    for simplex in tri.simplices:
        cp=pts_np[simplex].mean(axis=0)
        if cv2.pointPolygonTest(c32, (float(cp[0]), float(cp[1])), False) >= 0:
            faces.append([int(i) for i in simplex])
    scale = world_width / float(w)
    verts=[]; uvs=[]
    for x,y in pts_np:
        verts.append([(x - w/2) * scale, 0.0, (h/2 - y) * scale])
        uvs.append([float(x)/w, 1.0 - float(y)/h])
    ys,xs=np.where(mask>0)
    bbox=[int(xs.min()), int(ys.min()), int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1)]
    return {'schema':'source_locked_front_skin_recipe.v1','name':name,'source_image':str(image_path),'image_size':[int(w),int(h)],'world_width':world_width,'bbox_px':bbox,'vertices':verts,'uvs':uvs,'faces':faces,'boundary_point_count':int(len(c))}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--mask-out', required=True)
    ap.add_argument('--name', default='GEO_source_locked_front_skin')
    ap.add_argument('--world-width', type=float, default=7.2)
    ap.add_argument('--samples', type=int, default=90)
    ap.add_argument('--mode', default='green_yellow', choices=['green_yellow','bright','non_dark','otsu','alpha'])
    ap.add_argument('--hue-min', type=int, default=15)
    ap.add_argument('--hue-max', type=int, default=95)
    ap.add_argument('--sat-min', type=int, default=35)
    ap.add_argument('--value-min', type=int, default=24)
    ap.add_argument('--close-iters', type=int, default=2)
    ap.add_argument('--open-ksize', type=int, default=0, help='optional morphology open kernel size to remove thin guide/aura strokes before component selection')
    ap.add_argument('--dilate-iters', type=int, default=0)
    ap.add_argument('--epsilon-frac', type=float, default=0.0018)
    args=ap.parse_args()
    p=Path(args.image)
    img=cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise RuntimeError(f'cannot read {p}')
    m=foreground_mask(img, args.mode, args.hue_min, args.hue_max, args.sat_min, args.value_min)
    comp=largest_component(m, args.close_iters, args.dilate_iters, args.open_ksize)
    Path(args.mask_out).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(args.mask_out, comp)
    rec=make_recipe(p, comp, args.name, args.world_width, args.samples, args.epsilon_frac)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(rec, indent=2), encoding='utf-8')
    print(json.dumps({'vertices':len(rec['vertices']),'faces':len(rec['faces']),'boundary':rec['boundary_point_count'],'bbox_px':rec['bbox_px']}, indent=2))
if __name__=='__main__': main()
