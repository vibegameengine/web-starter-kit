# Metrics and thresholds for 1:1 reconstruction

## Mask IoU

`intersection(mask_ref, mask_render) / union(mask_ref, mask_render)`. Good for silhouette agreement. It punishes missing/extra visible area.

Recommended gates:

- >= 0.90: final flat/front-logo match.
- >= 0.85: acceptable mascot/soft-surface match if detail landmarks also pass.
- < 0.80: do not export as final.

## Centroid drift

Compare binary mask centroids from image moments. Use absolute pixels and percent of image diagonal.

Recommended gate: <= 12 px at 1024 px validation render, or <= 1.2% of width.

## Bounding box drift

Compare x/y center, width, height of reference and render masks.

Recommended gate: center <= 12 px; size <= 3% of image size.

## SSIM

Use as a perceptual diagnostic, not the only gate. SSIM can be unfair when materials/lighting differ; use it after binary masks pass.

Recommended gate: >= 0.75 for early textured validation; >= 0.88 for near-final flat-color overlay.

## Part-count gate

Part count is not a soft metric. If the manifest declares N structural components, the scene/export must contain exactly those N structural meshes. Decorative arcs, glow/context nodes, shadows, guide marks, and background rings must not be counted as structural components unless the manifest says so.

## Overlay image

Use two overlays:

1. reference as cyan/magenta, render as yellow/green, difference as red.
2. semi-transparent original reference behind front orthographic model render.

The final report should include metric JSON plus at least one visual overlay.
