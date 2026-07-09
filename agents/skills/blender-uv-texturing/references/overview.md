# Blender UV Texturing Domain Overview

## Skill purpose

A material can be physically plausible but still wrong if its UVs do not match the supplied art. This domain handles UV unwrap/projection/atlas/bake/lightmap operations.

## Core abilities to add over time

- Automated UV creation for front-locked mesh grids.
- Atlas region detection/cropping.
- Per-part atlas rectangle assignment.
- Alpha-decal material creation.
- Texture color-space validation.
- Bake target creation and map export.
- GLB texture audit after export.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Texture looks like random atlas noise | Full atlas projected to all parts | Crop/map per part |
| Black square behind face | Alpha ignored or source not keyed | Connect alpha and set blend mode; key black to alpha |
| Bump/roughness looks wrong | sRGB data color space | Set Non-Color |
| GLB missing texture | non-exportable shader or image not connected | Principled + Image Texture + UVs |
| Lightmap glows unnaturally | connected as emission | use multiply/helper or separate material channel |
