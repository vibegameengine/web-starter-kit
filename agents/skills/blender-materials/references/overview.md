# Materials & Shading — Pro Knowledge Overview

**Domain**: 05 — Materials, Shaders, PBR  
**Status**: Initial pass complete; ~3 more search rounds needed for the full recipe library  
**Last update**: 2026-04-27

---

## The big picture

Blender's **Principled BSDF** is the only shader you need for 95% of work, and the only one that exports cleanly to glTF. It implements the OpenPBR Surface model — same fundamentals as Disney BRDF and Standard Surface — so values transfer between renderers.

**Master rule**: Metallic is a switch (0 = dielectric, 1 = metal). There's no "in between" except for partially oxidized metal layers. If your value is between 0.2 and 0.8, you've probably set it wrong.

---

## Principled BSDF parameter map (Blender 5.x, "v2")

| Parameter | Range | Meaning | Pro defaults |
|-----------|-------|---------|--------------|
| **Base Color** | RGB | Diffuse for non-metals; F0 reflectance for metals | Metals: keep ≥ 0.5 sRGB across all channels |
| **Metallic** | 0–1 | 0 = dielectric, 1 = metal | Almost always 0 or 1 |
| **Roughness** | 0–1 | 0 = mirror, 1 = matte | Polished metal 0.05–0.15; brushed 0.2–0.4; weathered 0.5–0.8 |
| **IOR** | 1.0–2.5 | Refractive index | Glass 1.5; water 1.33; diamond 2.42; skin 1.4 |
| **Alpha** | 0–1 | Transparency | 1 = opaque |
| **Normal** | Vector | Normal map input | From Normal Map node, Non-Color color space |
| **Coat Weight** | 0–1 | Clear coat layer (car paint, varnish) | Tinted via Coat Tint, IOR via Coat IOR |
| **Sheen Weight** | 0–1 | Velvet/cloth fuzz at grazing angles | 0.1–0.5 for fabrics |
| **Sheen Roughness** | 0–1 | Fuzz roughness | 0.5 typical |
| **Sheen Tint** | RGB | Fuzz color | Slightly desaturated base for fabrics |
| **Subsurface Weight** | 0–1 | Replaces old Subsurface; multiplier on radius | 0 or 1 (with radius non-zero); Blender 5.x removed `Subsurface Color` input |
| **Subsurface Radius** | XYZ | RGB-channel scatter distance | Skin: ~(1.0, 0.2, 0.1); wax: ~(1.0, 1.0, 1.0) |
| **Subsurface IOR** | 1.0–2.5 | IOR within the subsurface medium | Skin 1.4 |
| **Subsurface Anisotropy** | -1 to 1 | Forward/back scatter directionality | Skin ~0.0; thin tissue 0.5+ |
| **Transmission** | 0–1 | Refractive transparency | Glass 1.0; thick glass +Volume Absorption |
| **Emission** | RGB | Self-illumination | For glowing objects, light-emitting surfaces |

**Source**: [Principled BSDF — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html)

---

## Decision tree: "What shader do I need?"

```
Is it a metal?
├── YES → Principled BSDF, Metallic=1.0
│         Base Color = F0 reflectance (lookup table)
│         Roughness = surface finish
│         (Specular has no effect when Metallic=1)
│
└── NO  → Is it transparent?
          ├── YES → Glass-like?
          │         ├── YES → Principled BSDF, Transmission=1, IOR=1.5, Roughness=0.0
          │         │         Add Volume Absorption for thick glass tint
          │         └── NO  → Translucent (skin, wax)?
          │                   → Principled BSDF, Subsurface Weight=1
          │                   Subsurface Radius per material
          │
          └── NO  → Fabric/cloth?
                    ├── YES → Sheen Weight 0.2–0.5, Roughness 0.6–0.9
                    └── NO  → Plastic/wood/stone?
                              → Principled BSDF, Metallic=0
                              IOR=1.45 (default plastic)
                              Roughness per material finish
                              Coat Weight 0.5+ for car paint / varnish
```

---

## The PBR values database (use this as your source of truth)

[**physicallybased.info**](https://physicallybased.info/) — the canonical reference for PBR values. Provides for every material:
- Base color (sRGB)
- Complex IOR (real + imaginary, for accurate metals)
- IOR (for dielectrics)
- F0 reflectance (for metals)
- Density (for physics + reference)

**Categories covered**:
- **Metals**: Aluminum, Brass, Copper, Gold, Iron, Nickel, Platinum, Silver, Titanium, Cobalt
- **Glasses/Transparent**: Borosilicate, Soda-lime, Diamond, Quartz
- **Water & Ice**: Water (1.333 IOR), Ice (1.310 IOR)
- **Organics**: 6 skin variants (1.400 IOR), Bone, Eye (Cornea, Lens, Sclera)
- **Foods**: Banana, Carrot, Chocolate, Honey (liquid + crystallized), juices, ketchup, milk, wine
- **Built/Industrial**: Concrete, Marble, Paper, Ceramics, Plastics, Asphalt, Charcoal

Updated as of 2026-04-26. **API access available**.

---

## Quick recipes (more in `recipes/`)

### Brushed steel (frame, hardware)
```python
mat.metallic = 1.0
mat.diffuse_color = (0.56, 0.57, 0.58, 1.0)  # raw iron F0
mat.roughness = 0.25  # brushed finish
# Optional anisotropy: 0.5 along grain direction
```

### Mirror chrome
```python
mat.metallic = 1.0
mat.diffuse_color = (0.55, 0.56, 0.55, 1.0)  # chromium F0
mat.roughness = 0.02
```

### Polished gold
```python
mat.metallic = 1.0
mat.diffuse_color = (1.022, 0.782, 0.344, 1.0)  # gold F0 (note: > 1.0 channels valid for metals)
mat.roughness = 0.05
```

### Polished copper
```python
mat.metallic = 1.0
mat.diffuse_color = (0.926, 0.721, 0.504, 1.0)  # copper F0
mat.roughness = 0.05
```

### Frosted glass (lens)
```python
mat.metallic = 0.0
mat.diffuse_color = (1.0, 1.0, 1.0, 1.0)
# Principled BSDF inputs:
bsdf.inputs['Transmission Weight'].default_value = 1.0
bsdf.inputs['IOR'].default_value = 1.5
bsdf.inputs['Roughness'].default_value = 0.3  # frost
```

### Dark mirror lens (sunglasses)
```python
mat.metallic = 0.8  # close to metal — strong reflection
mat.diffuse_color = (0.05, 0.08, 0.15, 1.0)  # dark blue-tint
mat.roughness = 0.05
bsdf.inputs['IOR'].default_value = 1.5
```

### Soft silicone (nose pads)
```python
mat.metallic = 0.0
mat.diffuse_color = (0.65, 0.63, 0.60, 1.0)
mat.roughness = 0.7
bsdf.inputs['IOR'].default_value = 1.4
```

### Skin (basic, light tone)
```python
mat.metallic = 0.0
mat.diffuse_color = (0.85, 0.65, 0.55, 1.0)
mat.roughness = 0.4
bsdf.inputs['Subsurface Weight'].default_value = 1.0
bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.2, 0.1)  # red scatters deepest
bsdf.inputs['Subsurface IOR'].default_value = 1.4
```

### Plastic (matte, hard)
```python
mat.metallic = 0.0
mat.diffuse_color = (0.8, 0.1, 0.05, 1.0)  # red plastic
mat.roughness = 0.6
bsdf.inputs['IOR'].default_value = 1.45
```

### Plastic (glossy, lacquered)
```python
mat.metallic = 0.0
mat.diffuse_color = (0.8, 0.1, 0.05, 1.0)
mat.roughness = 0.15
bsdf.inputs['IOR'].default_value = 1.45
bsdf.inputs['Coat Weight'].default_value = 0.8
bsdf.inputs['Coat Roughness'].default_value = 0.05
```

---

## Common pitfalls (what amateurs do wrong)

| Mistake | Why it's wrong | Fix |
|---------|---------------|-----|
| Metallic 0.5 to "look kinda metallic" | Energy-non-conservative; looks plasticky | Either 0 or 1; use a Mix Shader for partial coverage |
| Black metals (base color near 0,0,0) | Real metals reflect 30-100% | Keep metals' base color in lightest 30% sRGB |
| Roughness 0 for "perfect mirror" | Renders artifacts; Cycles needs ≥ 0.005 | Use 0.01–0.05 minimum |
| Specular adjusted on metals | Specular has no effect when Metallic=1 | Use Base Color and Roughness instead |
| sRGB normal maps | Causes wrong shading | Normal map texture must be set to Non-Color |
| Procedural shader exported to glTF | glTF only supports image textures | Bake procedural to image textures first |
| One material for whole object | Looks flat; loses wear/details | Use Mix Shader + masks for variation |
| Ignoring Coat for varnished surfaces | Misses the dual-layer reflection | Coat Weight 0.5+ on car paint, varnished wood, lacquer |

---

## Procedural materials: when and how

Use procedural (node-based) materials for:
- **Wood**: Wave Texture (grain) + Noise Texture (variation) + ColorRamp (tone)
- **Marble**: Voronoi Texture (veins) + Noise Texture (color variation)
- **Stone**: Noise Texture at multiple scales + Bump node
- **Fabric weave**: Wave Texture in two perpendicular directions + Mix
- **Rust/wear**: Noise Texture as mask between clean and weathered base

**Key node combo**:
```
Texture Coordinate → Mapping → [Noise/Wave/Voronoi] → ColorRamp → Mix → Principled BSDF
```

`Texture Coordinate` provides UV/Generated/Object space coords; `Mapping` applies translation/rotation/scale; the texture node generates pattern; `ColorRamp` shapes value-to-color; `Mix` blends with other layers.

**Limitation**: Procedural materials do NOT export to glTF. For glTF/web use, bake procedural results to image textures first (UV unwrap → Cycles bake → save PNG).

---

## Sheen (cloth) deep-dive

The new **Sheen** layer in Principled BSDF (since Blender 4.0) is built for fabrics:

- **Sheen Weight** — intensity of the velvet/fuzz reflection. 0.1 for cotton, 0.3 for velvet, 0.5+ for plush
- **Sheen Roughness** — softness of the fuzz; 0.5 typical
- **Sheen Tint** — usually slightly desaturated version of the base color, or pure white for plush

```python
# Velvet
bsdf.inputs['Base Color'].default_value = (0.6, 0.0, 0.1, 1.0)  # deep red
bsdf.inputs['Roughness'].default_value = 0.9
bsdf.inputs['Sheen Weight'].default_value = 0.5
bsdf.inputs['Sheen Roughness'].default_value = 0.5
bsdf.inputs['Sheen Tint'].default_value = (0.8, 0.6, 0.6, 1.0)
```

---

## Subsurface scattering for organics

Replaces the old "Subsurface" + "Subsurface Color" with a cleaner **Subsurface Weight** + **Subsurface Radius** (RGB scatter distance per channel):

| Material | Subsurface Weight | Radius (R, G, B) | IOR | Notes |
|----------|------------------|------------------|-----|-------|
| Skin (light) | 1.0 | (1.0, 0.2, 0.1) | 1.4 | Red scatters deepest |
| Skin (dark) | 1.0 | (0.5, 0.15, 0.05) | 1.4 | Less red scatter |
| Wax | 1.0 | (3.0, 3.0, 3.0) | 1.45 | Uniform deep scatter |
| Marble | 1.0 | (5.0, 5.0, 5.0) | 1.5 | Very deep scatter |
| Milk | 1.0 | (2.5, 2.5, 3.0) | 1.35 | Slight blue tint |
| Leaf | 1.0 | (0.5, 1.0, 0.3) | 1.4 | Green dominant |

**Scale these radius values to match your scene scale** (1 Blender unit = 1m). At 1mm scale, divide by 1000.

---

## Naming convention for materials

Per Blender Studio standards:
- `MAT-frame_metal_brushed` — `MAT-` prefix, `purpose_subtype_finish` body
- `MAT-lens_glass_dark_mirror`
- `MAT-pad_silicone_warm_gray`

Avoid: `Material.001`, `Material.027`. Always rename.

---

## Sources

**Tier A (official)**:
- [Principled BSDF — Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html)
- [Blender 4.0 Shading & Texturing release notes](https://developer.blender.org/docs/release_notes/4.0/shading/)

**Tier B (canonical PBR data)**:
- [Physically Based — PBR values database](https://physicallybased.info/) — 50+ materials with exact F0, IOR, density
- [CG Channel: Physically Based review](https://www.cgchannel.com/2022/08/physically-based-is-an-amazing-database-of-pbr-material-values/)

**Tier C (educators)**:
- [Gordon Brander: Blender Principled BSDF cheat sheet](https://gordonbrander.com/pattern/blender-principled-bsdf/)
- [Artisticrender — PBR explained](https://artisticrender.com/physically-based-rendering-and-blender-materials/)
- [cgbookcase — How to use PBR Textures in Blender](https://www.cgbookcase.com/learn/how-to-use-pbr-textures-in-blender)

**Tier D (procedural specifics)**:
- [Samuel Sullins — 10-node procedural wood](https://medium.com/@samuelsullins/make-this-easy-procedural-wood-material-in-blender-with-just-10-nodes-c94a3f8b54ad)
- [Ex Nihilo Digital — Texture Coordinate + Mapping nodes](https://exnihilodigital.com/tutorials/using-the-texture-coordinate-and-mapping-nodes/)
- [Artisticrender — ColorRamp node deep-dive](https://artisticrender.com/how-the-color-ramp-node-works-in-blender/)

---

## What's still needed (next research rounds)

- [ ] Full recipe library: 30+ specific materials with copy-paste Python code
- [ ] Anisotropy parameters for brushed/grooved metals
- [ ] Volume Absorption setups for tinted glass
- [ ] Transmission roughness vs surface roughness interaction
- [ ] Light path tricks (Light Path node) for fake reflections, fake refractions
- [ ] Mix Shader patterns for layering wear, dirt, decals
- [ ] Bake-to-glTF workflow for procedural materials
