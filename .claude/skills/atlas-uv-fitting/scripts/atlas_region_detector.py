#!/usr/bin/env python3
"""Detect candidate atlas/decal regions and normalized UV rectangles."""
from __future__ import annotations
import argparse, json
from pathlib import Path
import cv2, numpy as np

def mask(img, mode):
    if img.ndim==3 and img.shape[2]==4 and mode in ('auto','alpha'):
        return (img[:,:,3] > 8).astype('uint8')*255
    gray=cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2GRAY) if img.ndim==3 else img
    if mode=='dark_on_bright': _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    elif mode=='bright_on_dark': _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    else:
        _,a=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU); _,b=cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
        m=a if cv2.countNonZero(a)<=cv2.countNonZero(b) else b
    return m

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--image', required=True); ap.add_argument('--out', required=True); ap.add_argument('--mode', default='auto', choices=['auto','alpha','bright_on_dark','dark_on_bright']); ap.add_argument('--min-area', type=int, default=64); ap.add_argument('--pad', type=int, default=2); args=ap.parse_args()
    p=Path(args.image); img=cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
    if img is None: raise RuntimeError(f'cannot read {p}')
    h,w=img.shape[:2]; m=mask(img,args.mode)
    contours,_=cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regs=[]
    for i,c in enumerate(contours):
        area=float(cv2.contourArea(c))
        if area<args.min_area: continue
        x,y,bw,bh=cv2.boundingRect(c); x=max(0,x-args.pad); y=max(0,y-args.pad); bw=min(w-x,bw+2*args.pad); bh=min(h-y,bh+2*args.pad)
        # Blender UV origin is bottom-left; image bbox origin is top-left.
        u0=x/w; u1=(x+bw)/w; v1=1-y/h; v0=1-(y+bh)/h
        regs.append({'index':i,'area':area,'bbox_px':[int(x),int(y),int(bw),int(bh)],'uv_rect':[u0,v0,u1,v1],'role_hint':'unclassified'})
    regs.sort(key=lambda r:r['area'], reverse=True)
    out={'schema':'atlas_regions.v1','image':str(p),'image_size':[w,h],'regions':regs,'notes':['Rename role_hint values before automated UV assignment.']}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True); Path(args.out).write_text(json.dumps(out,indent=2),encoding='utf-8')
    print(args.out)
if __name__=='__main__': main()
