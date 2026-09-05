---
name: codex-asset-generation
description: >-
  Delegate BITMAP generation to the codex CLI and turn what it returns into
  production PBR maps. Codex can draw images (its game-artist skill wraps an
  imagegen stack); it is not a procedural-noise generator, and asking it to write
  numpy noise wastes the capability. Covers the exec invocation, passing a
  reference image so the output matches THAT asset, recovering images when codex
  cannot write files, and the mandatory post-process: seamless tiling, colour
  calibration against the reference, and desaturation of stretch artifacts.
  Use whenever an asset needs textures, sprites, decals or any generated bitmap
  and codex is available.
when_to_use: >-
  "generate a texture", "make the diffuse", "textures via codex", "sprite sheet",
  "generate art", any request to produce image assets with an external agent, and
  any time a generated map has to tile or match a supplied reference photo.
allowed-tools: Bash Read Write Edit Glob Grep
---

# Codex asset generation

Codex draws bitmaps. That is the whole point of delegating to it. If a prompt is
written as "write a Python script that generates a texture", the result is
procedural noise that looks nothing like the reference — the capability was there
and went unused.

## Non-negotiable rules

00. **IF A REFERENCE EXISTS IN ANY FORM, THE ASSET IS BUILT FROM IT — and the
    prompt must say so before it says anything else.**

    A reference "exists in any form" whenever the user has pointed at a picture,
    a render, a screenshot, a concept, a model or another asset — whether they
    attached it, named it, or merely said "like that one". There is no separate
    mode where a reference is present and the asset is designed independently of
    it. If a reference exists, it is not inspiration, it is the SOURCE.

    So the prompt opens by naming the reference's absolute path, ordering codex
    to open it and sample real pixel values out of it, and stating the test:

    > The only passing description of your output is "that is the same surface,
    > drawn flat and straight on". "Inspired by it", "in the same genre" and "in
    > the spirit of" are all failures.

    And it demands evidence the file was actually opened: **make codex report
    which pixel colours it sampled and where from.** Without that line, a run
    that never opened the file is indistinguishable from one that did — and it
    is the more likely of the two, because inventing a plausible stone is easier
    than matching a specific one.

    Written down because it was got wrong once and cost several rounds: the
    reference path was in the prompt, buried below the brief, with no sampling
    demand and no "inspired by" prohibition. Codex returned four perfectly
    competent PBR stone sets that looked nothing like the asset they were for,
    and the user's question was the right one — *where else would you take the
    textures from?*

0. **Say WHAT the asset is and WHAT IT IS FOR, in that order, before anything
   else.** "The button plates, isolated, as a source sheet I will cut into a
   nine-patch and stretch in the engine" produces a usable asset; "a weathered
   menu button" produces a picture of one. The purpose is what tells the
   generator which properties are load-bearing. See "State the job, not the
   vibe".
1. Ask codex for IMAGES, and name its art skill in the prompt so its image stack
   engages instead of its coding path.
2. Never pass the reference through `-i`. Write its absolute path directly in the
   prompt text and tell codex to open and look at the file itself. A described
   colour is a guess; a file the model actually opens is ground truth — `-i` is
   not the only way to get that, and it is the fragile one (see Invocation).
3. Never trust the returned file ORDER. Build a contact sheet and identify each
   image by eye before naming them.
4. A generated texture is not finished. It does not tile, its colours are lit-scene
   colours, and per-channel processing throws stray hues. Post-process every one.
5. Verify tiling by rolling the image half a tile and LOOKING at the seam, not by
   trusting the generator's claim.

## State the job, not the vibe

A prompt that describes a MOOD gets an interpretation. A prompt that describes a
JOB gets the asset. The difference is not politeness — the generator resolves
every ambiguity in your prompt toward "make a nice picture", and a nice picture
is rarely a usable asset.

Three things must be in the prompt, and the first one is usually missing:

**1. What it is FOR.** Put the pipeline stage in words, at the top: this will be
cut into a nine-patch and stretched; this is a tiling material for a floor; this
is a sprite composited over a moving background; this is the back plate under a
live UI. Every constraint below it then reads as a consequence instead of a
whim, and the generator stops "improving" the thing you need boring.

**2. That you want THE SAME asset, not one like it.** When a reference is
attached, say explicitly that the output must be describable as "the same object,
isolated" — and that anything describable as "inspired by" or "in the spirit of"
it is a failure. Name the specific properties that must survive: proportions,
border weight, palette, surface treatment. Then forbid the drift by name: do not
restyle, do not add bevels/gradients/ornament/rounded corners, do not change the
palette. Without that sentence you get a variation, and a variation next to the
reference reads as a mistake.

**3. Exactly ONE subject, and what is NOT in the frame.** "Only the buttons."
"Only the background, with the interface taken off it." Then enumerate what to
remove: the logo, the labels, the panels, the version text — and any *overlay*
baked into the reference, such as the gradient darkening one side to make text
readable. Overlays are the easiest thing to leave in by accident and the hardest
to remove later.

### Ask for the OPAQUE variant; add transparency at implementation

When a reference shows a UI element that looks semi-transparent, do NOT ask for
that look. Ask for the element painted **fully opaque and flat**, and say why:
the engine applies the alpha at render time, and a baked-in translucency would
compound with it — twice-faded, unfixable, and impossible to re-tune without
regenerating art.

The same reasoning generalises to every effect the runtime can apply itself:
opacity, tint, blur, glow, drop shadow, dimming, disabled fades. Bake the
IDENTITY of the asset; keep the STATE in code. An asset that carries its own
state cannot be restyled, cannot be re-tinted, and cannot be reused for the
second state you will inevitably need.

## Invocation

Codex has its own skill tree, separate from this project's. Enumerate it before
writing the prompt — capabilities live there, not in the CLI help:

```bash
ls ~/.codex/skills/
```

Non-interactive run, reference given as a path IN THE PROMPT, prompt piped from a
file:

```bash
codex exec -s workspace-write -C "<project-root>" - < prompt.txt
```

Where `prompt.txt` states the reference's absolute path as plain text and tells
codex to open it, e.g. `The reference is at C:\full\path\to\reference.png — open
it and look at it yourself before drawing anything.`

- **Never use `-i` to attach the reference.** It is documented as "attaches an
  image", but attaching stages the file through codex's own sandbox before the
  run starts, and that staging step can hard-fail before generation ever begins
  — for example when the platform's sandbox helper binary is missing after an
  upgrade. A path written into the prompt text has no such dependency: codex
  reads it with its own file tool, same as it reads any other file the task
  needs. Prefer this even when `-i` happens to be working — a project that
  works today may not tomorrow, and the two paths are not equally reliable.
- `-s workspace-write` lets it write into the workspace; `read-only` if it should
  only report.
- `-C` sets the working root.
- Piping the prompt from a file keeps long briefs out of shell quoting.
- Run it in the background; a multi-image batch takes minutes.

Model availability is account-bound. If it reports a model is unsupported or needs
a newer CLI, do not silently fall back — the account may allow exactly one model,
and probing others wastes minutes each. Report it and ask.

## When codex cannot write files

Its sandbox helper can be missing after an upgrade. The symptom is every shell
command failing with a sandbox/helper error — including reading the reference
file itself, if the run still routed it through `-i` — while image GENERATION
still succeeds. Do not conclude the run produced nothing.

Generated images are cached per session:

```bash
ls -lt ~/.codex/generated_images/*/
```

The newest session directory holds them, oldest-first by mtime matching the order
they were requested. Copy them out and do the post-processing locally. This turns a
hard failure into a working result.

## Prompt shape that works

State, in this order: which of its skills to use; the reference's absolute path
and that it is the single source of truth and must be opened and examined; the
exact output filenames;
then per-image, the material and its failure state, not just its name — "paint
flaked off over half the surface with crisp ragged edges" produces something usable,
"weathered wood" does not.

Then the constraints that decide whether the output is usable at all:

- seamless tileable, edges wrap, no border, no vignette
- FLAT lighting — no baked shadow, no directional highlight, no depth of field; it
  is a base-colour map, not a photograph of a lit surface
- orthographic, straight-on, filling the frame; no object silhouette, no background,
  no scene, no text, no watermark, no colour swatches

## Cut-outs: ask for a background COLOUR, never for transparency

The image stack cannot emit an alpha channel. Ask for "a fully transparent
background" and it does not refuse — it PAINTS a picture of transparency, the
familiar grey-and-white checkerboard, as opaque pixels. The file comes back RGB,
every pixel alpha 255, and the checker is now baked into the art.

So specify a background you can key instead:

- Name one flat, uniform colour and say it must fill every pixel that is not the
  subject. Say "solid <colour>", never "transparent", "alpha", or "no
  background" — those words are what summon the checkerboard.
- CHOOSE the colour against the subject: it must not appear anywhere in the
  subject, including its shadows and its darkest crevices. For a warm, earthy,
  desaturated subject a saturated green or magenta keys cleanly; for anything
  with foliage or skin tones, pick the one the subject does not contain.
- Ask for the subject to keep a clear margin from the frame edge, so the key has
  somewhere to start and a sticker can be placed without a visible box.
- State that the background must be FLAT — no gradient, no vignette, no shadow
  cast onto it. A shaded backdrop keys with a halo.

### Keying it out

Do not threshold on colour alone. Whatever key colour was chosen, some part of
the subject will come close to it somewhere, and a plain threshold eats holes in
exactly the places that matter. Take the background as the keyed region
**connected to the frame border** (label the mask, keep the components that touch
an edge). Anything key-coloured that is enclosed by the subject is part of the
subject and survives.

Two steps decide whether the cut-out looks right in an engine, and both are
invisible in the source image:

- **Despill.** Edge pixels are blended with the key colour, so left alone they
  ring the subject in a bright or coloured halo that only shows up once it is
  composited over something else. Rebuild the colour of every non-opaque pixel
  from its nearest opaque neighbour before applying the alpha.
- **Feather deliberately.** A one-pixel hard cut reads as a sticker pasted on;
  the eye catches the outline before it catches the art. Ramp the alpha inward
  over a small band — a couple of percent of the sprite — using the distance
  transform of the mask, and composite with real blending rather than an alpha
  test. Keep it small: a wide feather turns a broken edge into a smear, and the
  whole point of a break is that it is broken.

Prove it by compositing over a mid-tone field and LOOKING, not by reading the
alpha histogram. A halo is obvious over grey and invisible over the checker the
generator drew.

## Post-process (always)

### Seamless tiling

Use the periodic component of the image (Moisan's periodic/smooth decomposition).
The periodic part tiles exactly by construction and, unlike blending a border band,
does not smear detail at the seam.

```python
def periodic_component(u):            # u: single channel, float
    h, w = u.shape
    v = np.zeros_like(u)
    v[0, :]  = u[-1, :] - u[0, :]
    v[-1, :] = -v[0, :]
    v[:, 0]  += u[:, -1] - u[:, 0]
    v[:, -1] -= u[:, -1] - u[:, 0]
    fx = 2 * np.pi * np.fft.fftfreq(w)
    fy = 2 * np.pi * np.fft.fftfreq(h)
    d = 2 * (np.cos(fy)[:, None] + np.cos(fx)[None, :] - 2)
    d[0, 0] = 1
    s = np.real(np.fft.ifft2(np.fft.fft2(v) / d))
    return u - (s - s.mean())
```

Measure it: mean absolute difference between opposite edges, before and after. A
4-6x drop is a real fix; no change means it was applied wrong.

### Colour calibration against the reference

Generated colour drifts, and two different materials often come back in the same
family — walls and roof reading as one surface is the classic symptom. Fix it by
measurement, not by eye:

1. Crop patches from the reference for each material. SAVE the crops and look at
   them — a patch that accidentally samples background or shadow poisons everything
   downstream.
2. Record each patch's per-channel mean and standard deviation.
3. Map each generated map onto its target: `(ch - ch.mean()) * (target_std * k /
   ch.std()) + target_mean`, with `k` around 1.5 because a small evenly-lit patch
   understates how much a whole surface varies.

This is what separates materials that should differ. Two greys can have the same
brightness and still be distinct: one green-dominant, one warm-neutral. The
measurement catches that; the eye at a glance does not.

Caveat worth knowing before it bites: albedo calibrated to a *rendered* photo
already contains that photo's lighting. Light it again and it darkens twice — set
scene exposure so the render lands back on the reference's brightness.

### Kill stretch artifacts

Stretching channels independently flings scattered pixels into wild hues — rust maps
sprout blue speckles. Pull anything past a sane saturation back toward its own
luminance:

```python
lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
sat = (a.max(2) - a.min(2))[..., None]
k = np.clip((sat - 55.0) / 45.0, 0.0, 1.0)
a = a * (1 - k) + lum * k
```

When a map must be recoloured to a NEUTRAL target, flatten it to luminance FIRST,
then tint. Calibrating a saturated source straight onto a neutral target is what
paints coloured stripes across a surface.

### Derive the rest

Roughness from luminance, remapped per material. Normal from Sobel gradients — take
the gradient with wrapped differences so the normal map tiles as well as the diffuse.
Base colour is sRGB; roughness, normal and every other data map are Non-Color.

## Checklist

- [ ] A reference exists? Then the prompt's FIRST instruction is to open it and
      sample it, and it states that "inspired by" is a failure (rule 00).
- [ ] Codex was made to REPORT the pixel values it sampled, and that report is
      present in its reply. No report means treat the run as if the file was
      never opened.
- [ ] The prompt opens with what the asset is FOR, in pipeline terms.
- [ ] The prompt demands the SAME asset as the reference and forbids "inspired by".
- [ ] Exactly one subject per request, with everything else named and excluded.
- [ ] Any overlay baked into the reference (dimming gradient, scrim) was named for
      removal, not left to be inferred.
- [ ] UI elements were requested OPAQUE, with transparency deferred to the runtime.
- [ ] Codex's own skill list was enumerated before the prompt was written.
- [ ] Reference passed as an absolute path IN THE PROMPT TEXT, never via `-i`,
      and the prompt tells codex to open and examine it.
- [ ] Every returned image identified visually, not by position in the list.
- [ ] Seam error measured before and after; the rolled proof sheet was inspected.
- [ ] Each map's mean and spread calibrated to a reference patch that was eyeballed.
- [ ] Materials that should look different measurably do.
- [ ] No stray-hue speckles.
- [ ] Data maps are Non-Color; base colour is sRGB.
