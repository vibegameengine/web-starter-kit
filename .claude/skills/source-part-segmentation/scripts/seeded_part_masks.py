#!/usr/bin/env python3
"""Create named source-part masks from a seed manifest.

The script is intentionally conservative: it clips by explicit polygon/bbox/seed definitions and
then optionally thresholds inside that region. It is meant for reference-locked reconstruction
where an agent must preserve named part identity instead of accepting arbitrary connected components.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
import cv2
import numpy as np


def read_image(path: Path):
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise RuntimeError(f"cannot read {path}")
    if img.ndim == 2:
        bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        alpha = None
    elif img.shape[2] == 4:
        bgr = img[:, :, :3]
        alpha = img[:, :, 3]
    else:
        bgr = img[:, :, :3]
        alpha = None
    return bgr, alpha


def region_mask(shape, part):
    h, w = shape[:2]
    m = np.zeros((h, w), np.uint8)
    if 'polygon' in part:
        pts = np.array(part['polygon'], dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(m, [pts], 255)
    elif 'bbox' in part:
        x, y, bw, bh = [int(v) for v in part['bbox']]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(w, x + bw), min(h, y + bh)
        m[y0:y1, x0:x1] = 255
    else:
        raise RuntimeError(f"part {part.get('name')} needs polygon or bbox")
    return m


def threshold_inside(bgr, alpha, base, part):
    mode = part.get('mode', 'polygon')
    out = base.copy()
    if mode in ('polygon', 'bbox'):
        return out
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    if mode == 'alpha' and alpha is not None:
        t = (alpha > int(part.get('alpha_min', 8))).astype(np.uint8) * 255
    elif mode == 'dark_lines':
        t = ((hsv[:, :, 2] < part.get('value_max', 180)) & (hsv[:, :, 1] < part.get('sat_max', 160))).astype(np.uint8) * 255
    elif mode == 'bright_on_dark':
        t = ((hsv[:, :, 2] > part.get('value_min', 35)) & (hsv[:, :, 1] > part.get('sat_min', 25))).astype(np.uint8) * 255
    elif mode == 'hsv_range':
        lo = np.array(part.get('hsv_min', [0, 0, 0]), dtype=np.uint8)
        hi = np.array(part.get('hsv_max', [179, 255, 255]), dtype=np.uint8)
        t = cv2.inRange(hsv, lo, hi)
    elif mode == 'non_background':
        # Keep pixels that differ from a corner-sampled background by enough luma/chroma.
        corners = np.array([bgr[0,0], bgr[0,-1], bgr[-1,0], bgr[-1,-1]], dtype=np.float32)
        bg = np.median(corners, axis=0)
        dist = np.linalg.norm(bgr.astype(np.float32) - bg.reshape(1,1,3), axis=2)
        t = (dist > float(part.get('threshold', 18))).astype(np.uint8) * 255
    else:
        raise RuntimeError(f"unknown mode {mode}")
    out = cv2.bitwise_and(base, t)
    k = np.ones((3, 3), np.uint8)
    if part.get('close', False):
        out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, k)
    if part.get('open', False):
        out = cv2.morphologyEx(out, cv2.MORPH_OPEN, k)
    return out


def bbox_from_mask(m):
    ys, xs = np.where(m > 0)
    if len(xs) == 0:
        return [0, 0, 0, 0]
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--out-dir', required=True)
    args = ap.parse_args()
    manifest = json.load(open(args.manifest, encoding='utf-8'))
    img_path = Path(manifest['image'])
    if not img_path.is_absolute():
        img_path = Path(args.manifest).parent / img_path
    bgr, alpha = read_image(img_path)
    out = Path(args.out_dir); out.mkdir(parents=True, exist_ok=True)
    parts = []
    for part in manifest.get('parts', []):
        name = part['name']
        base = region_mask(bgr.shape, part)
        m = threshold_inside(bgr, alpha, base, part)
        if part.get('min_area') and int((m > 0).sum()) < int(part['min_area']):
            m = base
        mask_path = out / f"{name}_mask.png"
        cv2.imwrite(str(mask_path), m)
        parts.append({
            'name': name,
            'class': part.get('class', 'structural'),
            'mode': part.get('mode', 'polygon'),
            'area_px': int((m > 0).sum()),
            'bbox_px': bbox_from_mask(m),
            'mask': str(mask_path),
        })
    report = {'schema': 'source_part_inventory.v1', 'image': str(img_path), 'parts': parts}
    (out / 'part_inventory.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'parts': len(parts), 'out': str(out)}, indent=2))

if __name__ == '__main__':
    main()
