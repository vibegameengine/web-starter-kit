# Reference-to-3D Domain Overview

## Why this exists

General Blender recipe skills generate plausible models. Brand/template reconstruction requires a stricter pipeline: **measure the source, build to measurements, validate with overlays**.

## Required capabilities

1. Source inventory and source-of-truth ranking.
2. CV extraction of contours, components, centroids, bboxes, symmetry pairs.
3. Semantic part inventory (structural vs decorative).
4. Front-locked silhouette mesh generation.
5. Multi-view registration: front X/Z, side Y/Z, top X/Y, back validation.
6. UV/atlas mapping and texture color-space handling.
7. Quantitative validation: part count, IoU, centroid distance, bbox error, SSIM.
8. Export gating: refuse if validation fails.

## Practical thresholds

- Front silhouette IoU: ≥ 0.90 for blockout, ≥ 0.95 for final logo/mascot.
- Part count: exact for named/visible structural parts.
- Centroid drift: ≤ 1% of image diagonal for facial features/brand marks.
- BBox scale error: ≤ 2–3% for primary silhouette.

## Implementation roadmap

- `template_analyzer.py`: produce component JSON from source art.
- `silhouette_validator.py`: compare reference/render masks.
- Blender builder helpers: make reference planes, front-projected UVs, contour-filled meshes.
- Validation render recipe: orthographic masks with solid unlit material.
