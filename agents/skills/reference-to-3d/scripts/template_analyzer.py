#!/usr/bin/env python3
"""Analyze reference/template images for source-locked Blender reconstruction.

Outputs connected components + contours + simple shape features. This is intentionally
measurement-first, not semantic AI: the agent/user must still decide labels.
"""
import argparse, json
from pathlib import Path
import cv2
import numpy as np


def load_mask(path, mode, canny1=50, canny2=150, dilate=1):
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(path)
    if img.ndim == 3 and img.shape[2] == 4:
        alpha = img[:, :, 3]
        rgb = img[:, :, :3]
    else:
        alpha = None
        rgb = img[:, :, :3] if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    gray = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY)
    if mode == 'alpha' and alpha is not None:
        mask = alpha
    elif mode == 'bright_on_dark':
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    elif mode == 'dark_on_bright':
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    elif mode == 'edges':
        # For faint wireframes / grey blueprint lines. Canny captures anti-aliased
        # strokes that Otsu may treat as background. Dilation turns single-pixel
        # edges into measurable components.
        edges = cv2.Canny(gray, canny1, canny2)
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.dilate(edges, kernel, iterations=max(0, dilate))
    else:
        # auto: choose foreground as smaller side after Otsu.
        _, a = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        _, b = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        mask = a if np.count_nonzero(a) < np.count_nonzero(b) else b
    if mode != 'edges':
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return img, mask


def contour_record(contour, image_area, image_span):
    area = float(cv2.contourArea(contour))
    peri = float(cv2.arcLength(contour, True))
    x, y, w, h = cv2.boundingRect(contour)
    M = cv2.moments(contour)
    if M.get('m00', 0):
        cx = float(M['m10'] / M['m00']); cy = float(M['m01'] / M['m00'])
    else:
        cx = x + w / 2; cy = y + h / 2
    approx = cv2.approxPolyDP(contour, 0.006 * peri if peri else 1.0, True)
    circularity = float(4 * np.pi * area / (peri * peri)) if peri else 0.0
    aspect = float(w / h) if h else 0.0
    return {
        'area': area,
        'area_fraction': area / image_area,
        'score_fraction': max(area / image_area, peri / image_span),
        'perimeter': peri,
        'bbox': [int(x), int(y), int(w), int(h)],
        'centroid': [cx, cy],
        'aspect': aspect,
        'circularity': circularity,
        'approx_vertices': int(len(approx)),
        'contour': contour.reshape(-1, 2).astype(float).tolist(),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--mode', default='auto', choices=['auto','alpha','bright_on_dark','dark_on_bright','edges'])
    ap.add_argument('--min-area-frac', type=float, default=0.0005)
    ap.add_argument('--min-score-frac', type=float, default=0.0005, help='Keep long thin line components by max(area/image_area, perimeter/(w+h)).')
    ap.add_argument('--canny1', type=int, default=40)
    ap.add_argument('--canny2', type=int, default=120)
    ap.add_argument('--dilate', type=int, default=1)
    ap.add_argument('--mask-out')
    args = ap.parse_args()
    img, mask = load_mask(args.image, args.mode, args.canny1, args.canny2, args.dilate)
    h, w = mask.shape[:2]
    image_area = float(w * h)
    image_span = float(w + h)
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    recs = []
    for c in contours:
        r = contour_record(c, image_area, image_span)
        if r['area_fraction'] >= args.min_area_frac or r['score_fraction'] >= args.min_score_frac:
            recs.append(r)
    recs.sort(key=lambda r: r['area'], reverse=True)
    out = {
        'image': str(args.image),
        'size': [w, h],
        'mode': args.mode,
        'component_count': len(recs),
        'components': recs,
    }
    Path(args.out).write_text(json.dumps(out, indent=2))
    if args.mask_out:
        cv2.imwrite(args.mask_out, mask)
    print(json.dumps({'out': args.out, 'components': len(recs)}, indent=2))

if __name__ == '__main__':
    main()
