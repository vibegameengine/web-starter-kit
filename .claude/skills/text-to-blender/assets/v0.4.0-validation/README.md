# v0.4.0 Validation Proof Renders

Output from running the 5 representative validation prompts against real Blender 5.1.1 on 2026-04-27. These are committed to the repo as honest evidence that the skill's recipes execute end-to-end.

| File | What it shows | Engine | Skill chain |
|------|---------------|--------|-------------|
| `test1-modeling-materials-lighting-render.webp` | Beveled subdivided cube, matte red plastic, three-point lighting | EEVEE 64 samples | text-to-blender → blender-modeling → blender-materials → blender-lighting → blender-rendering |
| `test2-glass-cycles.webp` | Same geometry with clear glass material (transmission, refraction visible) | Cycles 128 samples + OIDN denoise | text-to-blender → blender-materials → blender-rendering |
| `test3-anim-frame001.webp` | Turntable animation, frame 1 (rotation = 0°) | EEVEE | text-to-blender → blender-animation → blender-rendering |
| `test3-anim-frame048.webp` | Turntable animation, frame 48 (rotation = 180°) | EEVEE | (same) |
| `test3-anim-frame096.webp` | Turntable animation, frame 96 (rotation = 360°) | EEVEE | (same) |

Test 5 (FBX export, 81 KB) and Test 6 (GLB export, 85 KB) produced binary files not committed here; the validation log records their successful export.

See [../../IMPLEMENTATION_LOG.md](../../../../../IMPLEMENTATION_LOG.md) for the detailed pass/fail record per test, including the two cross-version bugs surfaced and patched (BLENDER_EEVEE_NEXT name, action.fcurves API change).
