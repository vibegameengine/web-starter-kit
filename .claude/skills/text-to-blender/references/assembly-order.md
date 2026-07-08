# Scene Assembly Order — The Pro Sequence

The order in which you build a Blender scene determines whether you'll work efficiently or constantly redo work. This is the canonical sequence for nearly all production work.

---

## The 11-step order

```
1. Reference + plan          → Note goals; gather visual references
2. Block-out                 → Primitives at correct scale; validate composition
3. Camera + composition lock → Pick focal length; frame the shot
4. Light pass v1             → Three-point lighting; mood without color
5. Refine geometry           → Real models replacing primitives
6. Materials v1              → Flat colors; values before color
7. Light pass v2             → Add color, tune ratios
8. Detail pass               → Sculpting, fine textures, polish
9. Final render              → Production samples, denoising
10. Composite                → Color grade, glare, vignette
11. Export / output          → Target platform format
```

---

## Why this order

### Why blockout before detail?
A 30-minute primitive blockout reveals composition flaws before you've sunk hours into modeling. If the camera angle is wrong, you reshoot — easy at the blockout stage, painful after detail work.

### Why lighting before materials?
Lighting determines what you see. A material's roughness, glossiness, and texture only read correctly under appropriate lighting. Trying to match materials in flat lighting and then "lighting it later" guarantees rework.

### Why values before color?
Squint at any great image: it works in grayscale. The darkest dark + brightest bright should establish the focal point. Color is decoration on top of values. Get values right first, color tweaks later.

### Why detail last?
Detail is the most expensive work per visual impact. Don't invest in pores until you've validated the silhouette, lighting, and materials.

### Why composite last?
Compositing (color grading, glare, vignette) is non-destructive post-processing. It's the final 10% that takes a render from "good" to "polished". But it can't fix bad lighting or wrong composition.

---

## Time budgets per stage (for a hero still)

| Stage | % of total time |
|-------|-----------------|
| Reference + plan | 5–10% |
| Block-out + camera | 10–15% |
| Lighting setup | 10–20% |
| Modeling refinement | 30–40% |
| Materials + textures | 15–20% |
| Final render + composite | 5–10% |

**Anti-pattern**: 90% modeling, 10% lighting. Lighting and materials are what make a model *look* good; great geometry with bad lighting renders worse than mediocre geometry with great lighting.

---

## When to deviate from the order

The order is for **new scenes from scratch**. Common deviations:

- **Iteration on existing scene**: skip to step 5+ on the affected parts only.
- **Animation pipeline**: insert blocking at step 5 (rough timing on primitives), refine animation at step 8.
- **Asset library work**: jump to step 4 (lighting) immediately if you're just dressing a pre-built environment.
- **Tutorial recreation / reference**: follow the original's order if it makes pedagogical sense.

But: when in doubt, follow the order.

---

## Decision triggers — when to escalate fidelity

Do not move forward until current stage clears its check:

| Stage | Move on when… |
|-------|--------------|
| Block-out | Camera framing reads from thumbnail; silhouette tells the story |
| Form refinement | Forms read clearly at the rendered resolution |
| Light v1 | Subject pops from background; shadows describe form |
| Materials v1 | Grayscale values match reference; recognizable without color |
| Light v2 | Color mood matches reference; eye is led to subject |
| Detail | Within 30% time budget; value-add ratio is dropping |
| Composite | Image holds at thumbnail size AND 100% zoom |

---

## Critique protocol (every couple hours)

1. **Squint** — blur eyes / view thumbnail. Composition still readable?
2. **Greyscale** — values working independent of color?
3. **Flip horizontal** — catches blind-spots and asymmetry.
4. **Compare to reference** — side-by-side at same size.
5. **Walk away** — 30 minutes; come back fresh.

---

## Recovery patterns (when something goes wrong)

| Symptom | First check | Fix |
|---------|------------|-----|
| Render looks "flat" | Lighting variety | Add rim light, increase fill ratio |
| Render looks "too dark" | Exposure or HDRI | Bump exposure + 0.5; or HDRI strength |
| Render looks "too bright" | View transform | Switch to AgX from Standard |
| Materials look "plastic-y" | Roughness uniform | Add procedural roughness variation |
| Render looks "videogame-y" | Hard shadows + sharp geo | Soft shadows + bevel everything |
| Anatomy / proportions wrong | Reference closed | Reopen reference; compare landmarks |
| Render takes hours | Sample count | 256 + denoise; lower bounces |
| Animation jitters | Sub-frame mismatch | Bake simulations; check `frame_step` |
