#!/usr/bin/env python3
"""Compare reference/render images as masks and write validation metrics + overlay."""
from __future__ import annotations
import argparse, json
from pathlib import Path
import cv2
import numpy as np
try:
    from skimage.metrics import structural_similarity as ssim
except Exception:
    ssim = None

def mask(path, mode):
    img=cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None: raise RuntimeError(f'cannot read {path}')
    if img.ndim==3 and img.shape[2]==4 and mode in ('auto','alpha'):
        m=(img[:,:,3] > 8).astype('uint8')*255
        rgb=cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2RGB)
    else:
        rgb=cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2RGB) if img.ndim==3 else cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
        gray=cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        if mode=='edges': m=cv2.Canny(cv2.GaussianBlur(gray,(3,3),0),40,120)
        elif mode=='dark_on_bright': _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
        else: _,m=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    return rgb, (m>0)

def bbox(m):
    ys,xs=np.where(m)
    if len(xs)==0: return None
    return [int(xs.min()), int(ys.min()), int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1)]

def centroid(m):
    ys,xs=np.where(m)
    if len(xs)==0: return None
    return [float(xs.mean()), float(ys.mean())]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--reference', required=True)
    ap.add_argument('--render', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--overlay', default=None)
    ap.add_argument('--mode', default='auto', choices=['auto','alpha','edges','bright_on_dark','dark_on_bright'], help='legacy: use same mask mode for reference and render')
    ap.add_argument('--reference-mode', default=None, choices=['auto','alpha','edges','bright_on_dark','dark_on_bright'])
    ap.add_argument('--render-mode', default=None, choices=['auto','alpha','edges','bright_on_dark','dark_on_bright'])
    args=ap.parse_args()
    reference_mode = args.reference_mode or args.mode
    render_mode = args.render_mode or args.mode
    ref_rgb, ref=mask(Path(args.reference), reference_mode)
    ren_rgb, ren=mask(Path(args.render), render_mode)
    if ref.shape != ren.shape:
        ren=cv2.resize(ren.astype('uint8'), (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_NEAREST).astype(bool)
        ren_rgb=cv2.resize(ren_rgb, (ref.shape[1], ref.shape[0]))
    inter=np.logical_and(ref,ren).sum(); union=np.logical_or(ref,ren).sum()
    iou=float(inter/union) if union else 0.0
    mse=float(np.mean((ref.astype('float32')-ren.astype('float32'))**2))
    ssim_val=None
    if ssim:
        ssim_val=float(ssim(ref.astype('uint8')*255, ren.astype('uint8')*255, data_range=255))
    br, bn=bbox(ref), bbox(ren); cr, cn=centroid(ref), centroid(ren)
    ref_ratio=float(ref.mean()); ren_ratio=float(ren.mean())
    report={'iou':iou,'mse':mse,'ssim':ssim_val,'reference_mode':reference_mode,'render_mode':render_mode,'reference_foreground_ratio':ref_ratio,'render_foreground_ratio':ren_ratio,'reference_bbox':br,'render_bbox':bn,'reference_centroid':cr,'render_centroid':cn}
    if max(ref_ratio, ren_ratio) > 0 and min(ref_ratio, ren_ratio) / max(ref_ratio, ren_ratio) < 0.25:
        report['warning']='Mask foreground ratios differ strongly; compare same modality (silhouette-vs-silhouette or edge-vs-edge) before treating IoU as final.'
    if cr and cn:
        report['centroid_drift_px']=[cn[0]-cr[0], cn[1]-cr[1]]
    out=Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding='utf-8')
    if args.overlay:
        overlay=np.zeros((*ref.shape,3), dtype=np.uint8)
        overlay[ref]=[0,255,255]      # cyan reference
        overlay[ren]=[255,255,0]      # yellow render
        overlay[np.logical_and(ref,ren)]=[0,255,0]
        overlay[np.logical_xor(ref,ren)]=[255,0,0]
        cv2.imwrite(args.overlay, cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
    print(json.dumps(report, indent=2))
if __name__ == '__main__': main()
