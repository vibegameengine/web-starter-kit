# Pro Workflows — How Senior Artists Actually Work

**Domain**: 16 — End-to-end production patterns, scene assembly order, decision sequencing  
**Status**: Initial pass complete  
**Last update**: 2026-04-27

---

## The pro mindset

A senior 3D artist doesn't think "I'm modeling now, then materials, then lighting." They think:

> "What's the cheapest test I can render to validate the *concept* before I invest hours of work?"

Pros iterate at the lowest fidelity that answers the current question. Block out → critique silhouette → refine biggest issues → only then add detail. This is the Pareto principle applied to 3D: 80% of impressions come from 20% of decisions (silhouette, big shapes, key lighting, hero camera).

---

## The canonical scene-assembly order

```
1. Reference                 →  Gather images, study lighting/composition
                                Establish the goal BEFORE Blender opens
                                
2. Block-out                 →  Primitives only (cubes, spheres) at correct scale
                                Goal: validate composition + camera + silhouette
                                Time: 30 minutes, MAX
                                
3. Camera + composition lock →  Position camera, set focal length
                                Pose subjects against background
                                Validate with rule of thirds
                                
4. Light pass v1            →  Three lights minimum (key, fill, rim)
                                Don't worry about color yet
                                Goal: understand value structure
                                
5. Refine forms             →  Replace primitives with real models
                                Or refine block-out with sculpting
                                Keep checking against reference
                                
6. Materials v1             →  Flat colors first (no textures)
                                Get the *value* right (lightness/darkness)
                                Then add gloss / metallic
                                
7. Light pass v2            →  Now add color to lights
                                Tune ratios (key:fill, key:rim)
                                Check shadows from camera angle
                                
8. Detail pass              →  Now invest hours: high-poly sculpt, complex shaders, etc.
                                
9. Final lighting + render  →  Production samples, denoising
                                Render hero shot first
                                
10. Compositing             →  Color grade, glare, vignette, lens distortion
                                Always non-destructive
                                
11. Output                  →  Final image / animation export
                                Multiple formats if needed
```

**Key principle**: don't skip ahead. Don't add detail before the silhouette works. Don't tweak materials before lighting is decided. Each step's quality gates the next.

---

## Decision triggers — when to escalate fidelity

| Stage | Move on when… |
|-------|--------------|
| Block-out | Camera framing reads from thumbnail; silhouette tells the story |
| Forms refinement | Forms read well at the rendered resolution; no "guess what this is" parts |
| Light v1 | Subject pops from background; shadows describe form |
| Materials v1 | Values (lightness) align with reference; can recognize material type from grayscale |
| Light v2 | Color mood matches reference; eye is led to subject |
| Detail | Within 30% time budget for the project — stop adding detail when the value/cost ratio drops |
| Compositing | Image holds together at 100% zoom AND thumbnail size |

---

## Common professional pipelines

### Hero product render
```
Reference → block-out → camera lock → studio HDRI + 3-point →
form refinement → procedural materials (test) → bake to PBR maps →
final lighting tweak → 1024 samples + denoise → composite (glare, slight vignette) →
PNG @ 4K
```

### Character close-up
```
Sculpt high-poly → retopology (5K base) → multires re-detail → UV unwrap →
texture paint base → bake AO + normal maps → manual material refinement →
hair via particles or cards → cloth sim or modeling → rig (Rigify) →
pose → 3-point + HDRI + practical lights → 512 samples + denoise →
compositor: skin grade, slight bloom, vignette →
PNG @ 2K square
```

### Architectural visualization (interior)
```
Reference photo → import floorplan → block-out walls + doors at scale →
add furniture (links from asset library) → key lighting via window sun + HDRI →
fill with bounce light setup → adjust materials (wood, fabric, metals) →
detail pass on hero items → 1024 samples Cycles + denoise →
Light Group pass for re-lighting in compositor → composite warm/cool grade →
PNG @ 4K + 1080p MP4 turntable
```

### Animation (character action)
```
Storyboard → block-out animatic in Blender (cubes per character) → time-out shots →
build/link characters → rough animation pass → polish (anticipation, easing) →
secondary motion (cloth, hair sim) → camera animation → audio sync →
1 frame test render → adjust lighting per shot → render PNG sequence →
encode MP4 with ffmpeg → upload to review tool
```

### Game asset (low-poly + textures)
```
Concept reference → high-poly sculpt → retopo to target polycount →
UV unwrap + checker test for texel density → bake (normal, AO, ORM) →
Substance Painter for textures (or Blender if budget) → import textures →
test in target engine (Unity/Unreal) → iterate on shader → final FBX export →
target engine validation
```

---

## Critique workflow (the underrated step)

After every pass, do a **critique pass**:

1. **Squint**: blur your eyes (or render thumbnail). Does the composition still read?
2. **Greyscale**: render or filter to grayscale. Are values working independent of color?
3. **Flip horizontal**: catches asymmetry / awkward composition you've grown blind to.
4. **Compare to reference**: side-by-side at same size.
5. **Walk away for 30 minutes**: come back fresh. First impressions matter.

Pros do this **every couple hours**, not just at the end.

---

## Time budget guidelines

For a hero still image:

| Task | % of total time |
|------|-----------------|
| Reference + planning | 5–10% |
| Block-out + camera | 10–15% |
| Lighting setup | 10–20% |
| Modeling refinement | 30–40% |
| Materials + textures | 15–20% |
| Final render + composite | 5–10% |

**Anti-pattern**: spending 90% on modeling, 10% on lighting. Lighting and materials make a model *look* good. A great model with bad lighting renders worse than a mediocre model with great lighting.

---

## Recovery patterns (when things go wrong)

| Problem | First check | Fix |
|---------|------------|-----|
| Render looks "flat" | Lighting variety | Add rim light, increase fill ratio difference |
| Render looks "too dark" | Exposure or HDRI strength | View settings → Exposure +0.5; or boost HDRI strength |
| Render looks "too bright" | View transform | Switch to AgX from Standard |
| Materials look "plastic-y" | Roughness uniform | Add procedural variation (noise + ColorRamp on roughness) |
| Render looks "videogame-y" | Hard shadows + perfect geometry | Soft shadows (area lights) + bevel everything |
| Anatomy looks wrong | Forgot reference | Re-open reference, compare, fix |
| Render takes hours | Too many samples | 256 + denoise; check light path settings |
| Animation jitters | Sub-frame mismatch | Bake simulations; check `frame_step` |

---

## When to use addons (and which)

Native Blender + manual scripts cover ~90% of production. Some tasks benefit from addons:

| Need | Addon (paid unless noted) |
|------|--------------------------|
| Hard-surface chamfering | MESHmachine |
| Complex hair workflows | Hair Tool, Curve to Mesh |
| Auto-rigging | Auto-Rig Pro |
| Retopology | RetopoFlow |
| HDRI lighting | HDR Light Studio (or free HDRIs from Poly Haven) |
| Asset libraries | BlenderKit (mixed free/paid) |
| Game engine optimization | Decimate Pro, EasyMesh Batch Exporter |
| Procedural materials | Sanctus Library, Realtime Materials, Extreme PBR |

Most are not strictly necessary, but they save hours on common tasks.

---

## What pros do less than amateurs

- ❌ Tweaking individual vertices when a modifier achieves the same
- ❌ Spending hours on details visible only at 200% zoom
- ❌ Re-rendering at full quality instead of testing at 25%
- ❌ Hunting for the "perfect" tutorial instead of practicing fundamentals
- ❌ Adding more lights when fixing one bad light would solve the problem
- ❌ Modeling everything when assets/HDRIs would suffice

## What pros do more than amateurs

- ✅ Looking at reference at every step
- ✅ Saving incremental versions (`v01`, `v02`, `v03_lighting_pass`...)
- ✅ Naming things immediately
- ✅ Critiquing their own work harshly and often
- ✅ Walking away to reset eyes
- ✅ Testing renders at low quality first
- ✅ Reusing asset libraries

---

## "How long does X take?" benchmarks

For a competent intermediate user (these are realistic):

| Task | Time |
|------|------|
| Block-out a hero character (primitives) | 30 min |
| High-poly sculpt of a humanoid head | 8–16 hours |
| Retopology of a complex character | 4–8 hours |
| UV unwrap + texturing simple prop | 1–2 hours |
| Three-point lighting setup | 30 min |
| Cycles render setting tweaks for hero shot | 30–60 min |
| Compositor color grade | 30 min |
| Full Rigify rig customization | 2–4 hours |
| Rough animation pass (10s sequence) | 4–8 hours |
| Polish animation pass (10s sequence) | 16–32 hours |
| Final render of 10s @ 1080p (Cycles) | 4–24 hours (machine) + setup time |

For Claude/AI assistance, much of this can be parallelized — Claude does setup/scaffolding while artist focuses on creative decisions.

---

## Sources

- (No single authoritative source — this is synthesized from years of production knowledge)
- [Blender Studio — Production techniques](https://studio.blender.org/training/)
- Personal experience patterns from 80.lv, ArtStation, CG Cookie, FlippedNormals
- Cross-references with all other domain overviews in this knowledge base

---

## Outstanding

- [ ] Specific case studies: replicating a Pixar shot, mimicking a video game style
- [ ] Critique checklists per genre (portrait, product, environment)
- [ ] Solo vs team workflow differences
- [ ] Iteration protocols for client projects
