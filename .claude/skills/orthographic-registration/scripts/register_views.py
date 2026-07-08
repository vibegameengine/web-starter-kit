#!/usr/bin/env python3
"""First-pass registration report for orthographic reference sheets."""
from __future__ import annotations
import argparse, json, re
from pathlib import Path
import cv2, numpy as np
ROLES={'front':re.compile('front|avatar|master|hero',re.I),'side':re.compile('side',re.I),'back':re.compile('back',re.I),'top':re.compile('top',re.I)}
def role(p):
    for k,r in ROLES.items():
        if r.search(p.name): return k
    return 'unknown'
def mask(p):
    img=cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
    if img is None: raise RuntimeError(f'cannot read {p}')
    if img.ndim==3 and img.shape[2]==4:
        m=img[:,:,3]>8
    else:
        g=cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2GRAY) if img.ndim==3 else img
        _,a=cv2.threshold(g,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        _,b=cv2.threshold(g,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
        m=(a>0) if cv2.countNonZero(a) <= cv2.countNonZero(b) else (b>0)
    return m
def metrics(p):
    m=mask(p); ys,xs=np.where(m); h,w=m.shape
    if len(xs)==0: return {'path':str(p),'role':role(p),'image_size':[w,h],'empty':True}
    bbox=[int(xs.min()),int(ys.min()),int(xs.max()-xs.min()+1),int(ys.max()-ys.min()+1)]
    return {'path':str(p),'role':role(p),'image_size':[w,h],'bbox':bbox,'center':[float(xs.mean()),float(ys.mean())],'bbox_center':[bbox[0]+bbox[2]/2,bbox[1]+bbox[3]/2],'bbox_ratio':[bbox[2]/w,bbox[3]/h]}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('images', nargs='+'); ap.add_argument('--out', required=True); args=ap.parse_args()
    reps=[metrics(Path(x)) for x in args.images]
    by={r['role']:r for r in reps}
    report={'schema':'orthographic_registration.v1','views':reps,'coordinate_contract':{'front':'X/Z','side':'Y/Z','top':'X/Y','back':'rear X/Z'},'notes':[]}
    if 'front' in by and 'side' in by:
        report['depth_hint']={'front_height_ratio':by['front'].get('bbox_ratio',[None,None])[1],'side_height_ratio':by['side'].get('bbox_ratio',[None,None])[1],'side_depth_ratio':by['side'].get('bbox_ratio',[None,None])[0]}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True); Path(args.out).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(args.out)
if __name__=='__main__': main()
