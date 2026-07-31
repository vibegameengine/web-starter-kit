#!/usr/bin/env python3
"""Deterministic Tier-1 gate for Blender-MCP hand-modeling passes.

Zero-token, pure Python 3.10+ standard library only (no PIL/numpy). This is
pixel arithmetic, not a model call: it never judges style or material intent,
only whether the current pass's silhouette/proportions/orbit stability agree
with the reference closely enough to be worth spending an expensive AI-vision
review on. Run this BEFORE any agent-vision comparison, exactly as Tier 1
gates Tier 2 in the img2threejs pipeline.

Input contract: both PNGs must be RGBA, 8-bit, non-interlaced, with a
TRANSPARENT background (alpha=0 outside the subject) — e.g. a fast low-sample
EEVEE render with `scene.render.film_transparent = True`, NOT a raw
`get_viewport_screenshot` capture. A live viewport's background color and
lighting are uncontrolled and not comparable frame to frame; a transparent
render is. See SKILL.md "Capture protocol".

Subcommands:
  single       — reference vs one render: silhouette IoU, aspect/scale delta,
                 optional bilateral-symmetry check.
  multi-angle  — reference-angle render vs N orbit-angle renders: flags a
                 collapsed silhouette (a flat plane faking a volume) the way
                 a billboard nearly vanishes when seen edge-on.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path
from typing import Any

MASK_GRID_SIZE = 224
ALPHA_THRESHOLD = 16

SILHOUETTE_IOU_THRESHOLD = 0.85
ASPECT_RATIO_DELTA_THRESHOLD = 0.05
SCALE_DELTA_THRESHOLD = 0.08
SYMMETRY_ERROR_THRESHOLD = 0.10
DEFAULT_COLLAPSE_RATIO = 0.15

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def paeth_predictor(left: int, up: int, up_left: int) -> int:
    p = left + up - up_left
    pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
    if pa <= pb and pa <= pc:
        return left
    if pb <= pc:
        return up
    return up_left


def read_rgba_png(path: Path) -> tuple[int, int, list[int]]:
    """Returns (width, height, flat alpha-channel list). Raises on anything
    that isn't an 8-bit non-interlaced RGBA PNG — convert/re-export rather
    than silently guessing at another format."""
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path}: not a PNG file")
    cursor = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = None
    interlace = 0
    idat = bytearray()
    while cursor + 8 <= len(data):
        length = struct.unpack(">I", data[cursor : cursor + 4])[0]
        chunk_type = data[cursor + 4 : cursor + 8]
        chunk_data = data[cursor + 8 : cursor + 8 + length]
        cursor += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    if width is None or height is None:
        raise ValueError(f"{path}: missing IHDR")
    if bit_depth != 8 or interlace != 0:
        raise ValueError(f"{path}: expected 8-bit non-interlaced PNG, got bit_depth={bit_depth} interlace={interlace}")
    if color_type != 6:
        raise ValueError(
            f"{path}: expected RGBA (color_type=6, transparent background), got color_type={color_type}. "
            "Re-render with film_transparent = True."
        )
    channels = 4
    row_bytes = width * channels
    raw = zlib.decompress(bytes(idat))
    alpha: list[int] = []
    offset = 0
    previous = bytearray(row_bytes)
    for _ in range(height):
        filter_type = raw[offset]
        offset += 1
        row = bytearray(raw[offset : offset + row_bytes])
        offset += row_bytes
        for index in range(row_bytes):
            left = row[index - channels] if index >= channels else 0
            up = previous[index]
            up_left = previous[index - channels] if index >= channels else 0
            if filter_type == 1:
                row[index] = (row[index] + left) & 0xFF
            elif filter_type == 2:
                row[index] = (row[index] + up) & 0xFF
            elif filter_type == 3:
                row[index] = (row[index] + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                row[index] = (row[index] + paeth_predictor(left, up, up_left)) & 0xFF
            elif filter_type != 0:
                raise ValueError(f"{path}: unsupported PNG filter {filter_type}")
        for x in range(width):
            alpha.append(row[x * channels + 3])
        previous = row
    return width, height, alpha


def load_mask(path: Path, size: int = MASK_GRID_SIZE) -> list[bool]:
    width, height, alpha = read_rgba_png(path)
    mask: list[bool] = []
    for y in range(size):
        sy = min(height - 1, int(y * height / size))
        for x in range(size):
            sx = min(width - 1, int(x * width / size))
            mask.append(alpha[sy * width + sx] > ALPHA_THRESHOLD)
    return mask


def silhouette_iou(reference_mask: list[bool], render_mask: list[bool]) -> float:
    intersection = union = 0
    for ref, render in zip(reference_mask, render_mask):
        if ref or render:
            union += 1
            if ref and render:
                intersection += 1
    return intersection / union if union else 1.0


def bbox_of(mask: list[bool], size: int = MASK_GRID_SIZE) -> tuple[int, int, int, int]:
    xs = [i % size for i, v in enumerate(mask) if v]
    ys = [i // size for i, v in enumerate(mask) if v]
    if not xs:
        return (0, 0, 0, 0)
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    return (x0, y0, x1 - x0 + 1, y1 - y0 + 1)


def proportion_delta(ref_bbox: tuple[int, int, int, int], render_bbox: tuple[int, int, int, int]) -> dict[str, float]:
    _rx, _ry, rw, rh = ref_bbox
    _dx, _dy, dw, dh = render_bbox
    ref_ar = rw / rh if rh else 0.0
    render_ar = dw / dh if dh else 0.0
    aspect_delta = abs(ref_ar - render_ar) / ref_ar if ref_ar else (0.0 if render_ar == 0 else 1.0)
    ref_area, render_area = rw * rh, dw * dh
    scale_delta = abs(ref_area - render_area) / ref_area if ref_area else (0.0 if render_area == 0 else 1.0)
    return {"aspectRatioDelta": round(aspect_delta, 4), "scaleDelta": round(scale_delta, 4)}


def bilateral_symmetry_error(mask: list[bool], size: int = MASK_GRID_SIZE) -> float:
    total = mismatches = 0
    for y in range(size):
        row = y * size
        for x in range(size):
            mirrored = size - 1 - x
            total += 1
            if mask[row + x] != mask[row + mirrored]:
                mismatches += 1
    return mismatches / total if total else 0.0


def run_single(reference: Path, render: Path, expect_symmetric: bool) -> dict[str, Any]:
    reference_mask = load_mask(reference)
    render_mask = load_mask(render)
    iou = silhouette_iou(reference_mask, render_mask)
    ref_bbox, render_bbox = bbox_of(reference_mask), bbox_of(render_mask)
    proportions = proportion_delta(ref_bbox, render_bbox)
    symmetry = bilateral_symmetry_error(render_mask)

    checks: dict[str, Any] = {
        "silhouetteIoU": round(iou, 4),
        **proportions,
        "bilateralSymmetryError": round(symmetry, 4),
    }
    failures: list[str] = []
    if iou < SILHOUETTE_IOU_THRESHOLD:
        failures.append(f"silhouette IoU {iou:.3f} below threshold {SILHOUETTE_IOU_THRESHOLD}")
    if proportions["aspectRatioDelta"] > ASPECT_RATIO_DELTA_THRESHOLD:
        failures.append(f"aspect-ratio delta {proportions['aspectRatioDelta']:.3f} exceeds {ASPECT_RATIO_DELTA_THRESHOLD}")
    if proportions["scaleDelta"] > SCALE_DELTA_THRESHOLD:
        failures.append(f"scale delta {proportions['scaleDelta']:.3f} exceeds {SCALE_DELTA_THRESHOLD}")
    if expect_symmetric and symmetry > SYMMETRY_ERROR_THRESHOLD:
        failures.append(f"bilateral symmetry error {symmetry:.3f} exceeds {SYMMETRY_ERROR_THRESHOLD}")

    return {"passed": not failures, "checks": checks, "failures": failures}


def silhouette_area_fraction(path: Path) -> float:
    _w, _h, alpha = read_rgba_png(path)
    if not alpha:
        return 0.0
    foreground = sum(1 for a in alpha if a > ALPHA_THRESHOLD)
    return foreground / len(alpha)


def run_multi_angle(reference: Path, orbits: list[Path], collapse_ratio: float) -> dict[str, Any]:
    reference_area = silhouette_area_fraction(reference)
    angles = []
    any_degenerate = False
    for orbit in orbits:
        area = silhouette_area_fraction(orbit)
        ratio = 0.0 if reference_area <= 0.0 else area / reference_area
        degenerate = ratio < collapse_ratio
        any_degenerate = any_degenerate or degenerate
        angles.append({"path": str(orbit), "areaFraction": round(area, 4), "ratio": round(ratio, 4), "degenerate": degenerate})
    return {
        "passed": not any_degenerate,
        "referenceAreaFraction": round(reference_area, 4),
        "collapseRatio": collapse_ratio,
        "angles": angles,
        "failures": [] if not any_degenerate else ["degenerate view detected — silhouette collapsed from an orbit angle"],
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    single = sub.add_parser("single", help="reference vs one render")
    single.add_argument("--reference", type=Path, required=True)
    single.add_argument("--render", type=Path, required=True)
    single.add_argument("--expect-symmetric", action="store_true", help="gate on bilateral symmetry too")
    single.add_argument("--json", action="store_true")

    multi = sub.add_parser("multi-angle", help="reference angle vs orbit angles")
    multi.add_argument("--reference", type=Path, required=True)
    multi.add_argument("--orbit", type=Path, action="append", default=[], required=True)
    multi.add_argument("--collapse-ratio", type=float, default=DEFAULT_COLLAPSE_RATIO)
    multi.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)
    try:
        if args.command == "single":
            result = run_single(args.reference.expanduser().resolve(), args.render.expanduser().resolve(), args.expect_symmetric)
        else:
            result = run_multi_angle(
                args.reference.expanduser().resolve(),
                [p.expanduser().resolve() for p in args.orbit],
                args.collapse_ratio,
            )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result["passed"] else 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
