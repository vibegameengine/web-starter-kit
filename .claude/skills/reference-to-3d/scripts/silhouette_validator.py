#!/usr/bin/env python3
"""Compare reference and render masks for template-locked validation."""
import argparse, json
from pathlib import Path
import cv2
import numpy as np
try:
    from skimage.metrics import structural_similarity as ssim
except Exception:
    ssim = None


def mask(path, threshold=20):
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(path)
    if img.ndim == 3 and img.shape[2] == 4:
        m = img[:, :, 3]
    else:
        rgb = img[:, :, :3] if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        gray = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY)
        _, m = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    return (m > 0).astype(np.uint8)


def bbox(m):
    ys, xs = np.where(m > 0)
    if len(xs) == 0:
        return [0,0,0,0], [0.0,0.0]
    x0,x1,y0,y1 = xs.min(), xs.max(), ys.min(), ys.max()
    return [int(x0), int(y0), int(x1-x0+1), int(y1-y0+1)], [float(xs.mean()), float(ys.mean())]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reference', required=True)
    ap.add_argument('--render', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--threshold', type=int, default=20)
    args = ap.parse_args()
    a = mask(args.reference, args.threshold)
    b = mask(args.render, args.threshold)
    if a.shape != b.shape:
        b = cv2.resize(b, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_NEAREST)
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    iou = float(inter / union) if union else 0.0
    ba, ca = bbox(a); bb, cb = bbox(b)
    center_dist = float(np.linalg.norm(np.array(ca) - np.array(cb)))
    mse = float(np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2))
    ssim_val = float(ssim(a, b, data_range=1)) if ssim is not None else None
    out = {
        'reference': args.reference,
        'render': args.render,
        'iou': iou,
        'mse': mse,
        'ssim': ssim_val,
        'reference_bbox': ba,
        'render_bbox': bb,
        'reference_centroid': ca,
        'render_centroid': cb,
        'centroid_distance_px': center_dist,
    }
    Path(args.out).write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))

if __name__ == '__main__':
    main()
