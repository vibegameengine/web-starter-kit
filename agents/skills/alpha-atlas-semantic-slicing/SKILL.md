---
name: alpha-atlas-semantic-slicing
description: Slice transparent UI atlases into production PNGs through alpha connected-components, geometric clustering, and an explicit semantic review. Use when an atlas has a keyed/transparent background, when manual crop coordinates are unreliable, when UI parts must be identified before slicing, or when an agent needs to inventory every atlas element before building UI.
---

# Alpha Atlas Semantic Slicing

Use this for transparent UI atlases. The process has two gates: automatic geometry first, human semantic decisions second. Never jump directly from an atlas to runtime crops.

## 1. Build the alpha inventory

Use the keyed transparent PNG as input; preserve the source untouched. Detect every non-transparent connected component with ImageMagick:

```bash
magick atlas-keyed.png \
  -alpha extract -threshold 0 \
  -define connected-components:verbose=true \
  -define connected-components:area-threshold=40 \
  -connected-components 8 null:
```

Create an annotated contact sheet on a neutral grey checkerboard. Every detected component needs an ID and its exact alpha bounding box. Save this analysis beside the source atlas, never in `src/`.

Automatically cluster candidates only by geometry: same/near-equal dimensions, repeated row/column placement, or close decorative fragments. These clusters are candidates, not semantic truth.

## 2. Perform semantic review

Inspect the annotated atlas and the visual reference with eyes. For every cluster or singleton, decide exactly one of:

- one reusable UI object;
- visual variants of one object (default / active / disabled, icon variants);
- several independent objects that happen to have similar geometry;
- a multi-fragment object whose alpha bounds must be unioned;
- reference-only composition — never ship or crop it as a runtime image.

Record the decision as a small semantic review table mapping component IDs to an object name and its owning component directory. This table is an intermediate tool, not a substitute for generated PNGs or UI implementation.

Do not infer identity from symmetry. Do not merge parts merely because they are near each other. Use the reference to decide whether a frame, line, gem, icon, node, or button is an independent object.

## 3. Slice only approved objects

For each approved object, crop to the union of its selected components' non-zero alpha bounds. Do not use guessed rectangles, fixed atlas coordinates, a white matte, or a transparent margin as a final boundary.

- Retain all visible alpha, including intentional anti-aliased shadows.
- Produce one transparent PNG per semantic object/state.
- Put each PNG beside the narrowest component that imports it, e.g. `components/SkillNode/assets/lightning.png`.
- Keep a true shared visual only with its owning shared primitive; never create a detached atlas asset bucket.
- Do not import `concepts/` source images at runtime.

After slicing, make a contact sheet from the actual output PNGs on grey and inspect every crop. A runtime crop is rejected if it includes another element, drops an ornament, contains a white matte, or has a remaining key-color halo.

## 4. UI implementation gate

Before composing the screen, implement every independently visible sliced object as an intrinsic UI element. Give it a co-located preview with a kebab-case slug in `/ui-kit/<slug>` and inspect it in a headed browser. Only then assemble the screen.

For Patch9 art, the semantic component owns its source image and insets; Canvas Patch9 rendering stays a shared technical utility, never a public component named after the rendering technique.

## Never do this

- Do not hand-slice first and rationalize the coordinates later.
- Do not create a JSON inventory and stop there.
- Do not crop the atlas' full assembled screenshot as a production panel.
- Do not accept assets from code inspection, a build, or a full-screen composition alone.
