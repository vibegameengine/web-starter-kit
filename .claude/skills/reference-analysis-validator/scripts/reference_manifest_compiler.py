#!/usr/bin/env python3
"""Compile a source manifest + first-pass image measurements for reference-locked reconstruction.

The script intentionally does not guess artistic semantics. It classifies files by name,
extracts alpha/threshold/edge components, and writes machine-readable evidence that a
human/agent can promote into hard expected counts.
"""
from __future__ import annotations
import argparse, json, os, re
from pathlib import Path
import cv2
import numpy as np

VIEW_PATTERNS = {
    'front': re.compile(r'front|avatar|master|hero', re.I),
    'side': re.compile(r'side', re.I),
    'back': re.compile(r'back', re.I),
    'top': re.compile(r'top', re.I),
    'basecolor': re.compile(r'base.?color|albedo|diffuse|atlas', re.I),
    'emissive': re.compile(r'emissive|emission|glow', re.I),
    'roughness': re.compile(r'rough', re.I),
    'bump': re.compile(r'bump|height|normal', re.I),
    'lightmap': re.compile(r'light.?map|lightmap', re.I),
    'decal': re.compile(r'decal|face|expression', re.I),
    'aura': re.compile(r'aura|hud|ring|halo', re.I),
}

def classify(path: Path) -> str:
    name = path.name
    for label, rx in VIEW_PATTERNS.items():
        if rx.search(name):
            return label
    return 'unknown'

def load_mask(path: Path, mode: str) -> tuple[np.ndarray, dict]:
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise RuntimeError(f'cannot read {path}')
    meta = {'width': int(img.shape[1]), 'height': int(img.shape[0]), 'channels': int(img.shape[2]) if img.ndim == 3 else 1}
    if img.ndim == 3 and img.shape[2] == 4 and mode in ('auto', 'alpha'):
        mask = (img[:, :, 3] > 8).astype('uint8') * 255
        meta['mask_mode'] = 'alpha'
    else:
        gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        if mode == 'edges':
            blur = cv2.GaussianBlur(gray, (3, 3), 0)
            mask = cv2.Canny(blur, 40, 120)
            meta['mask_mode'] = 'edges'
        elif mode == 'bright_on_dark':
            _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            meta['mask_mode'] = 'bright_on_dark'
        elif mode == 'dark_on_bright':
            _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            meta['mask_mode'] = 'dark_on_bright'
        else:
            # choose the polarity with the smaller non-background foreground, but avoid tiny noise
            _, a = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            _, b = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            ca, cb = cv2.countNonZero(a), cv2.countNonZero(b)
            mask = a if ca <= cb else b
            meta['mask_mode'] = 'auto_otsu_small_foreground'
    return mask, meta

def components(mask: np.ndarray, min_area: int) -> list[dict]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for i, c in enumerate(contours):
        area = float(cv2.contourArea(c))
        if area < min_area:
            continue
        x, y, w, h = cv2.boundingRect(c)
        peri = float(cv2.arcLength(c, True))
        m = cv2.moments(c)
        cx = float(m['m10']/m['m00']) if m['m00'] else x+w/2
        cy = float(m['m01']/m['m00']) if m['m00'] else y+h/2
        out.append({'index': i, 'area': area, 'perimeter': peri, 'bbox': [int(x), int(y), int(w), int(h)], 'centroid': [cx, cy], 'points': int(len(c))})
    out.sort(key=lambda d: d['area'], reverse=True)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+', help='image files or folders')
    ap.add_argument('--out', required=True, help='output manifest JSON')
    ap.add_argument('--mode', default='auto', choices=['auto','alpha','edges','bright_on_dark','dark_on_bright'])
    ap.add_argument('--min-area', type=int, default=80)
    args = ap.parse_args()
    files=[]
    for item in args.inputs:
        p=Path(item)
        if p.is_dir():
            files += [x for x in p.rglob('*') if x.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.tif','.tiff')]
        elif p.exists():
            files.append(p)
    sources=[]
    for f in sorted(files):
        try:
            mask, meta = load_mask(f, args.mode)
            comps = components(mask, args.min_area)
            sources.append({'path': str(f), 'role_guess': classify(f), 'image': meta, 'component_count': len(comps), 'largest_components': comps[:20]})
        except Exception as e:
            sources.append({'path': str(f), 'role_guess': classify(f), 'error': str(e)})
    manifest={
        'schema': 'reference_manifest.v1',
        'primary_view': 'front',
        'source_files': sources,
        'expected_primary_parts': {},
        'validation_thresholds': {'front_mask_iou_min': 0.85, 'bbox_center_tolerance_px': 12, 'bbox_size_tolerance_ratio': 0.03, 'part_count_exact': True},
        'notes': ['Promote measured components into expected_primary_parts before modeling. Do not treat role_guess as final authority.']
    }
    out=Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(out)
if __name__ == '__main__': main()
