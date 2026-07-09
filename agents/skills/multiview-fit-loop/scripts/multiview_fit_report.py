#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
import cv2
import numpy as np

VIEWS=('front','side','back','top')

def load_mask(path: Path, mode: str):
    img=cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None: raise RuntimeError(f'cannot read {path}')
    rgb=cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2RGB) if img.ndim==3 else cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
    hsv=cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h,w=rgb.shape[:2]
    if mode=='wire_black':
        # Dark construction/object lines; exclude saturated guide colors by saturation/value and remove label area via largest component.
        m=((hsv[:,:,2] < 155) & (hsv[:,:,1] < 100)).astype('uint8')*255
        m=cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3,3),np.uint8))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
        keep=np.zeros_like(m)
        # Keep largest non-label component by area; this is the object line network.
        comps=[]
        for i in range(1,n):
            x,y,bw,bh,area=stats[i]
            if area < 50: continue
            # reject bottom labels and tiny text fragments
            if y > h*0.88 and bh < h*0.08: continue
            comps.append((area,i))
        if comps:
            _,idx=max(comps)
            keep[labels==idx]=255
        m=keep
    elif mode=='bright':
        gray=cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        m=(gray > 24).astype('uint8')*255
        # Keep all bright body pixels but remove tiny speckles.
        m=cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3,3),np.uint8))
    elif mode=='alpha' and img.ndim==3 and img.shape[2]==4:
        m=(img[:,:,3]>8).astype('uint8')*255
    else:
        gray=cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    return rgb, m>0

def bbox(m):
    ys,xs=np.where(m)
    if len(xs)==0: return None
    return [int(xs.min()), int(ys.min()), int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1)]

def centroid(m):
    ys,xs=np.where(m)
    if len(xs)==0: return None
    return [float(xs.mean()), float(ys.mean())]

def compare(ref_path, ren_path, out_overlay, ref_mode='wire_black', ren_mode='bright'):
    ref_rgb, ref=load_mask(Path(ref_path), ref_mode)
    ren_rgb, ren=load_mask(Path(ren_path), ren_mode)
    if ref.shape != ren.shape:
        ren=cv2.resize(ren.astype('uint8'), (ref.shape[1],ref.shape[0]), interpolation=cv2.INTER_NEAREST).astype(bool)
    br, bn=bbox(ref), bbox(ren); cr, cn=centroid(ref), centroid(ren)
    inter=np.logical_and(ref,ren).sum(); union=np.logical_or(ref,ren).sum()
    h,w=ref.shape
    rep={'reference':str(ref_path),'render':str(ren_path),'reference_mode':ref_mode,'render_mode':ren_mode,'image_size':[w,h],
         'reference_bbox':br,'render_bbox':bn,'reference_centroid':cr,'render_centroid':cn,
         'iou':float(inter/union) if union else 0.0,
         'reference_foreground_ratio':float(ref.mean()),'render_foreground_ratio':float(ren.mean())}
    if br and bn:
        rep['bbox_center_drift_px']=[(bn[0]+bn[2]/2)-(br[0]+br[2]/2),(bn[1]+bn[3]/2)-(br[1]+br[3]/2)]
        rep['bbox_size_ratio']=[bn[2]/br[2] if br[2] else None, bn[3]/br[3] if br[3] else None]
        rep['bbox_size_error_ratio']=[(bn[2]-br[2])/br[2] if br[2] else None, (bn[3]-br[3])/br[3] if br[3] else None]
        rep['pass_bbox_center_1p5pct']=abs(rep['bbox_center_drift_px'][0]) <= 0.015*w and abs(rep['bbox_center_drift_px'][1]) <= 0.015*h
        rep['pass_bbox_size_5pct']=abs(rep['bbox_size_error_ratio'][0]) <= 0.05 and abs(rep['bbox_size_error_ratio'][1]) <= 0.05
    if cr and cn:
        rep['centroid_drift_px']=[cn[0]-cr[0], cn[1]-cr[1]]
    overlay=np.zeros((*ref.shape,3), dtype=np.uint8)
    overlay[ref]=[0,255,255]
    overlay[ren]=[255,255,0]
    overlay[np.logical_and(ref,ren)]=[0,255,0]
    overlay[np.logical_xor(ref,ren)]=[255,0,0]
    Path(out_overlay).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_overlay), cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
    return rep

def main():
    ap=argparse.ArgumentParser()
    for v in VIEWS:
        ap.add_argument(f'--{v}-template')
        ap.add_argument(f'--{v}-render')
    ap.add_argument('--out', required=True)
    ap.add_argument('--overlay-dir', required=True)
    args=ap.parse_args()
    report={'schema':'multiview_fit_report.v1','views':{},'summary':{}}
    all_center=[]; all_size=[]
    for v in VIEWS:
        t=getattr(args,f'{v}_template'); r=getattr(args,f'{v}_render')
        if not (t and r): continue
        rep=compare(t,r,Path(args.overlay_dir)/f'{v}_fit_overlay.png')
        report['views'][v]=rep
        if 'pass_bbox_center_1p5pct' in rep: all_center.append(rep['pass_bbox_center_1p5pct'])
        if 'pass_bbox_size_5pct' in rep: all_size.append(rep['pass_bbox_size_5pct'])
    report['summary']['all_bbox_centers_pass']=bool(all_center) and all(all_center)
    report['summary']['all_bbox_sizes_pass_5pct']=bool(all_size) and all(all_size)
    report['summary']['all_views_pass_first_pass']=report['summary']['all_bbox_centers_pass'] and report['summary']['all_bbox_sizes_pass_5pct']
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report['summary'], indent=2))
if __name__=='__main__': main()
