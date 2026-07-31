---
name: dev-lab-authoring
description: >-
  Build and maintain isolated DEV-only feature labs (demo/inspection routes that
  exercise one system in isolation). MANDATORY before creating a new lab, adding
  a debug/demo route, giving a feature "somewhere to look at it", or touching an
  existing lab's stage, route, or registration. Enforces the four rules: a lab
  exports nothing, a lab starts from the shared lab stage instead of inventing
  its own canvas/lights/grid/post, every lab is registered in the DEV lab
  registry that generates the routes, and the lab index is preview-image cards.
  Trigger on: "add a lab", "debug route", "isolated demo", "somewhere to test
  this", "tuning bench", "showcase route", "inspection scene", "/labs", "lab
  gallery", "lab stage", "why does every lab look different".
---

# DEV lab authoring

A **lab** is a DEV-only route that shows ONE system working, in isolation, with
nothing else in the frame that could explain the result. It is the surface the
visual gate is satisfied on before a feature is integrated, and the bench a
system is tuned on afterwards.

Labs are the most-copied code in a game repo: the next lab is always written by
opening the last one and changing the middle. That is fine — and it is exactly
why the *outside* of a lab must be fixed and boring. If every author invents the
canvas, the lighting and the route wiring, the copy carries the invention
forward, and within a dozen labs no two are the same shape.

## The four rules

### 1. A lab is a leaf — it exports NOTHING

**Nothing outside a lab may import anything from inside it.** A lab consumes the
feature it demonstrates; it never becomes a dependency of that feature, of
another lab, or — worst of all — of the shipped game.

The single permitted export is the lab's **registration manifest** (rule 3),
consumed only by the lab registry. Everything else a lab contains — its arena,
its demo props, its camera rig, its overlay, its fixtures — stays private.

Why this is a hard rule and not a preference:

- A lab is *allowed to be wrong*. It is where you park a half-tuned material and
  an arena with the walls in the wrong place. The moment production imports it,
  that freedom is gone and the lab starts being maintained as a shipping asset —
  it just doesn't look like one to whoever changes it next.
- A lab is DEV-only and its route is stripped from production builds. An import
  from production code **defeats the stripping**: the lab's modules, and every
  asset they reach, land in the shipped bundle. The tree-shaking looks like it
  works because the *route* is gone; the weight is still there.
  - The one sanctioned exception is a **showcase deployment** — a demo site whose
    whole point is the labs — switched on by an explicit build flag, off by
    default, and shared by every inspection surface the kit has rather than
    invented per surface. It changes what ships, never what may import what:
    production code importing a lab stays banned either way, and a lab still
    exports nothing but its manifest. Whatever renders the LINK to such a route
    must read the same flag, or a build ships a button to a route it does not
    contain.
- The same leak happens through a **shared barrel**. If a feature's public
  barrel re-exports its lab screen, the lab is in the same chunk as the
  production screen beside it. Never put a lab and a production visual module in
  one barrel — the lab's route must import it from its own file.

When production genuinely needs something a lab has, that thing was never a lab
concern: **move it into the feature it belongs to and let the lab import it from
there.** The direction is always lab → feature, never feature → lab. Moving it
is a real edit with a real visual check, not a re-export.

The smell, in order of how often it happens: a scene imports a "demo" prop out
of a lab folder because it was the only one that existed; a second lab imports
the first lab's arena; a feature barrel re-exports the lab screen "so the router
can find it"; a test imports a lab fixture.

### 2. A lab starts from the SHARED lab stage

There is one shared stage that owns the parts every lab needs and no lab should
be choosing: the canvas and its renderer settings, the sun and its shadow, the
ambient/fill lighting, the ground and its reference grid, the post-processing
chain, the inspection camera and its orbit controls, and the first-frame
readiness signal.

**A lab mounts that stage and puts its subject on it.** It does not write its
own `<Canvas>`, its own light rig, its own grid, or its own post chain.

- The stage is **parameterized, not copied.** If a lab needs a darker key, a
  larger ground, no grid, or no post, that is an OPTION on the stage — added
  once, available to all — not a private re-implementation. Adding the option is
  usually a smaller diff than the copy would have been.
- **A grid variant is not a personal expression.** The reference grid exists so
  scale reads the same in every lab: one metre is the same square everywhere,
  and an object that looks right in one lab looks right in the next. A lab that
  brings its own grid spacing and colours has silently changed the ruler.
- The stage is the only place that knows the project's renderer conventions —
  shadow type, pixel ratio, colour management, the static/dynamic split, the
  warmup/readiness handshake. Every hand-rolled canvas is a place those
  conventions are already out of date and nobody knows it.
- **A lab that legitimately cannot use the stage** — because the stage IS its
  subject (a fog volume that owns the whole atmosphere, a renderer experiment) —
  says so in one comment naming what it replaces and why. That comment is the
  whole exemption process; without it, the next author copies the deviation
  believing it was considered.

The failure this rule exists to stop is not ugliness, it is **incomparability**.
When each lab lights its subject differently, two labs cannot be held next to
each other, a material tuned in one is wrong in the other, and "does this look
right?" has no answer that survives the trip to the game.

### 3. Every lab is REGISTERED, and the registry generates the routes

Each lab declares one manifest — a stable id, a title, a one-line description of
what the lab proves, its category, its preview image, and a lazy loader for its
screen. The registry collects those manifests automatically (a glob over the
lab folders, not a hand-maintained list), and **the router builds its DEV routes
from the registry**.

- **No hand-registration.** A per-lab block copied into the router is how a repo
  ends up with routes nobody remembers, screens with no route, and two names for
  one lab. If adding a lab means editing the router, someone will add a lab
  without editing the router.
- **The registry is the only list.** A lab that is not in it does not exist —
  there is no second place to look, and no lab is discoverable only by reading
  the router source.
- **The whole registry is DEV-gated in one place**, so labs cannot leak into
  production one forgotten guard at a time.
- **The manifest is metadata, not an API.** It carries strings and a loader. It
  must not export the lab's components, systems, or fixtures — that would be
  rule 1 with extra steps.

The description field is not decoration: it is what makes the index usable. Write
what the lab lets you SEE ("mount and align a weapon on the rig, then test-fire
it"), not what it contains ("weapon lab scene").

### 4. The lab index is PREVIEW CARDS — not a list of links

There is one index route listing every lab, and it shows each lab as a **card
with a preview image** of that lab's actual rendered frame, plus its title and
description.

This is its own rule because a text list is the thing it is easy to settle for,
and a text list does not work. Nobody remembers which of thirty kebab-case names
is the one with the ragdoll; you remember what it *looked like*. The picture is
the index. The words are the caption.

- The preview is a **real captured frame from that lab**, produced by a headed
  capture pass — never a hand-drawn icon, a logo, a colour swatch, or a
  screenshot of something else.
- Previews are captured by a **script that drives the index's own registry**, so
  a new lab is picked up without editing the capture list.
- A lab with no preview yet renders a clearly-marked placeholder card. A missing
  picture must look missing — never disguised as a decorative tile, or nobody
  will ever capture it.
- Re-capture when a lab's look changes. A stale preview is worse than none: it
  sends you into the wrong lab confidently.
- Group cards by category and keep the grid scannable. The index is used at a
  glance, from across the desk.

## What a lab owns, and what it must not

**A lab owns:** its subject mounted on the shared stage; the controls that drive
it (sliders, toggles, camera presets, a fire/step/reset button); a readout of
whatever numbers the tuning produces; its own fixture data (an arena, a pose, a
sample set); and the copy that explains it.

**A lab must not own:** a second copy of the feature's logic (drive the REAL
system — a lab that reimplements what it demonstrates proves nothing); a private
fork of a shared entity; renderer or lighting conventions (rule 2); its own
route registration (rule 3); or any state that outlives it.

**Tune the real thing, then hand the numbers back.** A tuning lab's output is
values the feature's own catalog/definition file will hold. Give it a readout
that prints those values in the exact shape the source expects, and a copy
button. The alternative — a lab whose sliders diverge from what ships — is worse
than no lab, because it certifies a configuration nobody runs.

**Initialize controls from the feature's real current values, never from zero.**
A bench that opens at zero cannot show you what is wrong with what ships; it
only shows you what happens when you drag a slider away from nothing.

## Build a lab

1. **Name what the lab proves**, in one sentence, before writing anything. That
   sentence becomes the manifest description and decides everything else. If it
   is more than one sentence, it is more than one lab.
2. **Check the index first.** If a lab already exercises this system, extend it —
   add a mode, a toggle, another subject — rather than opening a second route
   onto the same thing. Two labs onto one system means neither is authoritative,
   and the newer one silently rots.
3. **Mount the shared stage.** Options only; no private canvas or light rig.
4. **Mount the REAL subject** — the shipping entity, the shipping system, the
   shipping material.
5. **Add the controls and the readout**, initialized from the real values.
6. **Write the manifest** and let the registry route it.
7. **Capture the preview** and confirm the card in the index.
8. **Satisfy the visual gate headed** — the lab is the isolated proof surface,
   so a lab that has not been looked at has not been built.

## One lab per subject — and one route per lab

Two anti-patterns, both of which look reasonable on the day:

- **Several routes onto one screen.** A lab that takes a parameter (which
  location, which sample, which weapon) does not need one route per value. It
  needs ONE route and a selector inside it — the selector is a control, and
  controls belong to the lab. A family of near-identical route names each
  passing a different constant into the same screen is a registry pretending to
  be a router. Deep-linking to a specific value is a query parameter on the one
  route, not a second route.
- **Several labs onto one subject.** Where a system has grown a second lab
  because the first was inconvenient to change, the fix is to fix the first one.

## Naming and automation

- One kebab-case id per lab, used as its route, its folder, its manifest id and
  its preview filename. One name, everywhere — never a folder that disagrees
  with its route.
- Name a lab for its SUBJECT, not for the study that produced it. A lab called
  after a one-off investigation is unfindable six weeks later.
- **Renaming a route breaks the automation pointed at it** (probe scripts,
  bookmarks, notes). Rename with a redirect from the old path, and grep the
  repository's scripts for the old name in the same change.
- Labs are driven by scripts more than any other surface, so `data-testid` on
  every control is not optional here — see `ui-test-ids`. A lab whose buttons can
  only be found by their label text will lose an afternoon to a selector that
  matched the wrong one.

## Acceptance

A lab is done when all of these are true:

- [ ] Nothing outside it imports anything from inside it (grep for its folder).
- [ ] It contains no `<Canvas>`, light rig, grid, or post chain of its own — or
      one comment naming why the stage cannot serve it.
- [ ] Its manifest is present and the route came from the registry, not the
      router.
- [ ] Its card appears in the index with a real captured preview.
- [ ] It drives the real system, and its readout matches the shape of the file
      the values belong in.
- [ ] Every control has a `data-testid`.
- [ ] It has been opened in a headed browser and looked at.
