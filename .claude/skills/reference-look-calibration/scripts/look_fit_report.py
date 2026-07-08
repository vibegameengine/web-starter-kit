#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
import cv2, numpy as np

def read(path, size=None):
    img=cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None: raise RuntimeError(f'cannot read {path}')
    if size: img=cv2.resize(img,size)
    return img

def mask_bright(img, min_v=30, min_s=30):
    hsv=cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return ((hsv[:,:,2] > min_v) & (hsv[:,:,1] > min_s))

def mask_hue_band(img, hue_min, hue_max, min_s=45, min_v=35):
    hsv=cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h=hsv[:,:,0]
    if hue_min <= hue_max:
        hue_mask=(h >= hue_min) & (h <= hue_max)
    else:
        # Allow wraparound bands, e.g. red across 179/0.
        hue_mask=(h >= hue_min) | (h <= hue_max)
    return hue_mask & (hsv[:,:,1] > min_s) & (hsv[:,:,2] > min_v)

def bbox(m):
    ys,xs=np.where(m)
    if len(xs)==0: return None
    return [int(xs.min()),int(ys.min()),int(xs.max()-xs.min()+1),int(ys.max()-ys.min()+1)]

def stats(img,m):
    px=img[m]
    if len(px)==0: return None
    hsv=cv2.cvtColor(px.reshape(-1,1,3),cv2.COLOR_BGR2HSV).reshape(-1,3)
    return {'mean_bgr':[float(x) for x in px.mean(axis=0)],'std_bgr':[float(x) for x in px.std(axis=0)],'mean_hsv':[float(x) for x in hsv.mean(axis=0)],'std_hsv':[float(x) for x in hsv.std(axis=0)],'brightness_mean':float(hsv[:,2].mean()),'brightness_p95':float(np.percentile(hsv[:,2],95)),'saturation_mean':float(hsv[:,1].mean())}

def iou(a,b):
    u=np.logical_or(a,b).sum()
    return float(np.logical_and(a,b).sum()/u) if u else 0.0

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--reference', required=True)
    ap.add_argument('--product', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--overlay')
    ap.add_argument('--accent-hue-min', type=int, help='Optional OpenCV HSV hue minimum (0-179) for an accent/glow color band to compare')
    ap.add_argument('--accent-hue-max', type=int, help='Optional OpenCV HSV hue maximum (0-179) for an accent/glow color band to compare')
    args=ap.parse_args()
    ref=read(args.reference)
    prod=read(args.product, (ref.shape[1], ref.shape[0]))
    rb=mask_bright(ref); pb=mask_bright(prod)
    report={'schema':'look_fit_report.v1','reference':args.reference,'product':args.product,'object_iou_bright_mask':iou(rb,pb),'reference_bbox':bbox(rb),'product_bbox':bbox(pb),'reference_stats':stats(ref,rb),'product_stats':stats(prod,pb)}
    if args.accent_hue_min is not None and args.accent_hue_max is not None:
        ra=mask_hue_band(ref,args.accent_hue_min,args.accent_hue_max)
        pa=mask_hue_band(prod,args.accent_hue_min,args.accent_hue_max)
        report['accent_hue_band']=[args.accent_hue_min,args.accent_hue_max]
        report['accent_hue_iou']=iou(ra,pa)
    if report['reference_stats'] and report['product_stats']:
        rh=report['reference_stats']['mean_hsv']; ph=report['product_stats']['mean_hsv']
        report['mean_hsv_delta']=[ph[i]-rh[i] for i in range(3)]
        report['diagnosis=[]'] = []
        diag=[]
        if ph[2] > rh[2]*1.25: diag.append('product too bright')
        if ph[1] < rh[1]*0.85: diag.append('product too desaturated')
        if abs(ph[0]-rh[0]) > 6: diag.append('hue drift')
        report['diagnosis']=diag
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report,indent=2),encoding='utf-8')
    if args.overlay:
        ov=np.zeros((*rb.shape,3),dtype=np.uint8)
        ov[rb]=[0,255,255]
        ov[pb]=[255,255,0]
        ov[np.logical_and(rb,pb)]=[0,255,0]
        ov[np.logical_xor(rb,pb)]=[255,0,0]
        cv2.imwrite(args.overlay, cv2.cvtColor(ov,cv2.COLOR_RGB2BGR))
    print(json.dumps({'object_iou':report['object_iou_bright_mask'],'accent_hue_iou':report.get('accent_hue_iou'),'diagnosis':report.get('diagnosis')},indent=2))
if __name__=='__main__': main()
