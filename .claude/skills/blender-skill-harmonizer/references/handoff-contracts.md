# Blender skill handoff contracts

## Reference analysis → registration

Input: source image folders.
Output: `reference_manifest.json` with roles, expected parts, validation thresholds.

Registration must not invent part counts; it consumes the manifest.

## Registration → contour/mesh generation

Input: `registration_report.json`, canonical view policy, scale/axis contract.
Output: geometry recipe parameters and reference planes/cameras.

Contour/mesh generation must honor the coordinate contract: front = X/Z, side = Y/Z, top = X/Y.

## Contour/mesh → UV fitting

Input: locked structural mesh names, source masks/contours, atlas regions.
Output: active UV maps and material assignments.

UV fitting may analyze atlas regions before geometry locks, but final UV writes wait for stable mesh topology or stable projected bounds.

## UV/material → lighting/look

Input: texture-fit report, material node graph, target original/look images.
Output: calibrated material values, emission strengths, aura/HUD color, lights, render settings.

Lighting must not be used to hide geometry or UV errors.

## Validation → repair optimizer

Input: multiview fit reports, texture/look reports.
Output: dependency-ordered repair queue.

Repair optimizer owns sequential/parallel scheduling after failures.

## Repair optimizer → export

Input: all gates passed or documented conflict policy.
Output: final `.blend`, base `.glb`, optional context/aura `.glb`, build notes.

Export skill refuses final export if validation gates are missing.
