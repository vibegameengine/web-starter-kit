#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,cv2,numpy as np
from pathlib import Path

def mask(path):
    img=cv2.imread(str(path),cv2.IMREAD_UNCHANGED)
    if img is None: raise RuntimeError(path)
    if img.ndim==3 and img.shape[2]==4: m=img[:,:,3]>8
    else:
        gray=cv2.cvtColor(img[:,:,:3],cv2.COLOR_BGR2GRAY) if img.ndim==3 else img
        _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU); m=m>0
    return m.astype('uint8')

def largest_contour(m):
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    if not cs: return None
    return max(cs,key=cv2.contourArea)[:,0,:].astype('float32')

def bbox(c):
    xs=c[:,0]; ys=c[:,1]
    return [float(xs.min()),float(ys.min()),float(xs.max()-xs.min()+1),float(ys.max()-ys.min()+1)]

def sample(c,n):
    pts=c
    d=np.sqrt(((np.roll(pts,-1,axis=0)-pts)**2).sum(axis=1))
    s=np.r_[0,np.cumsum(d)]
    total=s[-1]
    out=[]
    for target in np.linspace(0,total,n,endpoint=False):
        i=np.searchsorted(s,target,side='right')-1
        t=(target-s[i])/max(d[i],1e-9)
        out.append((pts[i]*(1-t)+pts[(i+1)%len(pts)]*t).tolist())
    return np.array(out,dtype='float32')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source-mask',required=True); ap.add_argument('--product-mask',required=True); ap.add_argument('--out',required=True); ap.add_argument('--samples',type=int,default=64)
    args=ap.parse_args()
    sc=largest_contour(mask(args.source_mask)); pc=largest_contour(mask(args.product_mask))
    if sc is None or pc is None: raise SystemExit('missing contour')
    ss=sample(sc,args.samples); ps=sample(pc,args.samples); delta=ps-ss
    rep={'schema':'contour_correspondence_report.v1','source_mask':args.source_mask,'product_mask':args.product_mask,'samples':args.samples,'source_bbox':bbox(sc),'product_bbox':bbox(pc),'mean_delta_px':[float(x) for x in delta.mean(axis=0)],'max_sample_error_px':float(np.sqrt((delta*delta).sum(axis=1)).max()),'sample_deltas_px':delta.tolist()}
    Path(args.out).parent.mkdir(parents=True,exist_ok=True); Path(args.out).write_text(json.dumps(rep,indent=2),encoding='utf-8')
    print(json.dumps({'mean_delta_px':rep['mean_delta_px'],'max_sample_error_px':rep['max_sample_error_px']},indent=2))
if __name__=='__main__': main()
