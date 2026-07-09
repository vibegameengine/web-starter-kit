#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
import cv2, numpy as np

def load_mask(path, mode):
    img=cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None: raise RuntimeError(f'cannot read {path}')
    rgb=cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2RGB) if img.ndim==3 else cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
    hsv=cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    if mode=='alpha' and img.ndim==3 and img.shape[2]==4:
        m=(img[:,:,3]>8).astype('uint8')*255
    elif mode=='dark_lines':
        m=((hsv[:,:,2]<170)&(hsv[:,:,1]<130)).astype('uint8')*255
    elif mode=='bright_on_dark':
        m=((hsv[:,:,2]>35)&(hsv[:,:,1]>30)).astype('uint8')*255
    else:
        gray=cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    return rgb,m

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--mode', default='auto', choices=['auto','alpha','dark_lines','bright_on_dark'])
    ap.add_argument('--min-area', type=int, default=300)
    ap.add_argument('--watershed', action='store_true')
    args=ap.parse_args()
    out=Path(args.out_dir); out.mkdir(parents=True, exist_ok=True)
    rgb,m=load_mask(args.image,args.mode)
    kernel=np.ones((3,3),np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,kernel)
    labels=None
    if args.watershed:
        sure_bg=cv2.dilate(m,kernel,iterations=3)
        dist=cv2.distanceTransform(m,cv2.DIST_L2,5)
        _,sure_fg=cv2.threshold(dist,0.35*dist.max(),255,0)
        sure_fg=np.uint8(sure_fg)
        unknown=cv2.subtract(sure_bg,sure_fg)
        n,markers=cv2.connectedComponents(sure_fg)
        markers=markers+1; markers[unknown==255]=0
        bgr=cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR)
        markers=cv2.watershed(bgr,markers)
        labels=markers
        component_ids=[i for i in np.unique(labels) if i>1]
    else:
        n,labels,stats,cent=cv2.connectedComponentsWithStats(m,8)
        component_ids=range(1,n)
    comps=[]
    for idx in component_ids:
        cm=(labels==idx).astype('uint8')*255
        area=int((cm>0).sum())
        if area<args.min_area: continue
        ys,xs=np.where(cm>0)
        bbox=[int(xs.min()),int(ys.min()),int(xs.max()-xs.min()+1),int(ys.max()-ys.min()+1)]
        mp=out/f'part_{len(comps):03d}_mask.png'
        cv2.imwrite(str(mp),cm)
        comps.append({'id':len(comps),'label':int(idx),'area':area,'bbox_px':bbox,'mask':str(mp)})
    report={'schema':'source_part_segmentation.v1','image':args.image,'mode':args.mode,'watershed':args.watershed,'components':comps}
    Path(out/'segmentation_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'components':len(comps),'out':str(out)},indent=2))
if __name__=='__main__': main()
