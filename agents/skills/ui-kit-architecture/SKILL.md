---
name: ui-kit-architecture
description: >-
  Build and evolve the isolated UI-kit feature for this React game. Use when
  creating or changing reusable UI primitives, menus, HUD controls, dialogs,
  Patch9 wrappers, UI asset placement, UI-kit exports, or when deciding whether
  a screen should compose UI-kit rather than own another UI feature.
---

# UI Kit Architecture

`features/ui-kit` is an isolated feature, not a dumping ground. It owns reusable
visual primitives and their implementation details; screens compose those
primitives and own routing and game actions.

## Ownership

- `ui-kit` may import only `shared/` code and its own files. Never import a
  screen, router, game domain, combat system, or another vertical feature.
- A UI-kit component receives data and callbacks through props. It must not
  navigate, mutate gameplay state, or decide screen-specific copy.
- Export the usable component from `features/ui-kit/index.ts`; keep renderer,
  styling, Patch9 slices, and assets private to its component directory.
- Each screen assembles its UI from public UI-kit components. The screen owns
  route transitions, pause/combat callbacks, feature-specific labels, and its
  layout composition.

The starter scene's DOM overlay is a kit reference too: keep it in
`ui-kit/components/DemoSceneHud/`. It may wrap a caller-provided canvas child,
but receives labels and callbacks as props; it never imports `world`, a scene,
or audio/gameplay code.

## One scaler owns the entire runtime UI

- Wrap the complete runtime HTML overlay exactly once in the screen's shared
  `ScalableContainer`. HUD, touch controls, menus, panels, maps, tooltips and drag
  ghosts must all remain descendants of that same scaler.
- **Never use `createPortal(..., document.body)` or render a sibling outside the
  scaler to escape its transform.** This is an architecture violation, even when
  it appears to fix mobile sizing or pointer math locally.
- Size touch controls in the scaler's logical design space. If a button becomes
  too small on a phone, give it a larger logical width/height at that breakpoint;
  do not counter-scale it, portal it, or introduce a second scaler.
- Pointer-driven components must be scaler-aware: derive the rendered/logical
  ratio from `getBoundingClientRect()` and the element's logical dimensions, then
  convert pointer coordinates into logical coordinates for placement and hit tests.
- Full-screen backdrops use `position: fixed; inset: 0` inside the shared scaler.
  Maps and modal panels use logical coordinates inside that same containing block.
- A DEV-only diagnostic may portal into an explicit preview-owned host only when
  it is not runtime game UI and is not being used to bypass `ScalableContainer`.

## Co-locate assets with their consumer

Never create `assets/` at a feature root merely to store images. Place every
runtime asset beside the narrowest component that imports it:

```
features/ui-kit/
  components/
    MenuButton/
      MenuButton.tsx
      assets/
        menu-active.png
        menu-default.png
        menu-disabled.png
    MenuPanel/
      MenuPanel.tsx
      assets/
        menu-panel.png
```

- A button state image belongs in that button component's `assets/` directory.
- A panel frame belongs in the panel component's `assets/` directory.
- A screen-only image belongs beside that screen, not in a global or feature-root
  asset bucket.
- Import assets statically from their owner so the bootstrap registry discovers
  and preloads them. Use `asset-optimization-pipeline` before importing or
  re-slicing an image.

Only create a shared asset owner when the asset is itself a real shared primitive
with two or more consumers. Put it in `shared/<owner>/assets/`; that shared owner
must import it directly. Never create an unowned `assets/` bucket “for later”.
If a UI-kit component is the shared primitive, its assets still stay beside that
component. In practice, most assets remain private to their slice or component.

## Workflow

1. Check whether the requested UI repeats across screens. If not, build it in
   the screen with existing UI-kit primitives — except the starter scene's
   visible DOM overlay, which belongs in `DemoSceneHud` as a presentation-only
   reference composition.
2. If it repeats, create one UI-kit component with a narrow prop contract.
3. Co-locate its CSS and runtime assets in the component directory.
4. Keep Patch9 image, source insets, border insets and disabled state inside
   that component; callers choose intent (`variant`, `disabled`, callbacks), not
   texture files or atlas coordinates.
5. Export only the component from `features/ui-kit/index.ts`.
6. Let screens compose the exported component and supply their own actions.
7. Give every independently visible element its own kebab-case slug and a
   co-located `preview.tsx` exporting `uiKitPreview`. The DEV gallery discovers
   previews recursively and must expose each one at `/ui-kit/<slug>`; direct
   links must survive reload. A compound screen keeps its own assembly preview
   in addition to, never instead of, its parts.
8. Run focused lint, confirm bootstrap assets, and verify both the `/ui-kit`
   preview and the composed screen in a headed browser.

## Mandatory isolated visual gate

Never accept a UI-kit component from source inspection, a unit test, or an
in-world frame alone. Open `/ui-kit/<slug>` in a headed browser, inspect it at
its preview size, and exercise every interactive state. The gallery's recursive
`import.meta.glob('../**/preview.tsx')` registry is the only discovery mechanism.
Keep preview props deterministic and self-contained: no router, game state,
network data, or active 3D scene.

### Hard gate for composite UI

For atlas-driven menus, HUDs, trees, dialogs, or any UI made from more than one
visible element, the following order is mandatory:

1. Identify every visible element before coding: outer frame/backdrop, header,
   every panel, button state, icon/node, connector and decorative state.
2. Implement each element as an independently renderable UI-kit component with
   an intrinsic size. The assembly component owns only positioning and data
   wiring; a part must not rely on the assembly's absolute coordinates to render.
3. Give every part a slugged isolated preview at `/ui-kit/<slug>`. A blank
   frame, backdrop, and disabled button are still elements and still need a
   preview when visible in the final composition.
4. Open every slug in a headed browser and inspect it with eyes. Click every
   interactive part and verify default, active, pressed, disabled and impact
   states that the part supports.
5. Only after all part previews pass, assemble the composite and inspect its
   own slug, then inspect the consuming screen.

Do not use a single large shell, full-composition screenshot, CSS rectangle, or
unframed black filler to hide missing parts. A composition is rejected if any
visible piece lacks its own slugged preview or if a part is accepted only from
the final screen.

### Mandatory visual checkpoint — every UI change

Before starting a second visual change, take a fresh headed screenshot and pass
every item below against the reference. A failed item blocks further work; fix
it first and take a new screenshot. Do not treat DOM bounds, a build, or a
snapshot tree as visual evidence.

- **Silhouette and seams:** header, frame, panels and dividers touch exactly as
  in the reference. Reject any transparent gap, detached cap, overlap, doubled
  edge, stretched corner or mismatched outer silhouette.
- **Inventory and construction:** every reference icon, ornament, state and
  connector appears once at its intended anchor. Build panels from semantic
  parts; never put a real control over a baked control in a whole-panel PNG.
  Generate a bitmap only when no exact source asset exists, then inspect it in
  its own preview before use.
- **Geometry and hierarchy:** compare intrinsic sizes, column gaps, anchors,
  crop, selected icon/ring, title, rank, dividers, cost, copy and action order.
  For trees, enumerate every node and connector at explicit coordinates; never
  infer or auto-space the graph.
- **Interaction and isolation:** every visible action has exactly one semantic
  control with visible disabled, focus and pressed states. Inspect each changed
  `/ui-kit/<slug>` component before the composite route.
- **Evidence:** retain the headed frame used for the decision and state the
  reference mismatch it proves fixed. Do not claim acceptance without it.

### Reference preparation and in-place diff gate

When a UI task has a visual reference, prepare the reference before changing the
implementation: identify the exact component bounds, crop only that composition
from any surrounding annotations or canvas, inspect the crop, and label it
`reference-only`. It is validation material, never a replacement panel asset.

The composite's own `/ui-kit/<slug>` preview must contain the comparison control;
never put it on a detached diff route. One button opens the prepared reference
directly over the live composition and immediately enables a high-contrast live
heatmap/difference view. Use that control before every next visual edit; a build,
DOM bounds, or a separate screenshot page is not a substitute.

For a reference-locked DEV preview, register the same target with
`installPixelDiffAgentApi()` from `ui-kit/systems/pixelDiff`. A browser-control
agent must call the console API before claiming a visual fix:

```ts
await window.__uiKitPixelDiff.compare('component-slug', { threshold: 20 })
await window.__uiKitPixelDiff.show('component-slug', { threshold: 20 })
```

`compare()` returns `mismatchPercent`, `meanDelta`, `maxDelta`, exact raster
size, and mismatch count; `show()` renders its raster heatmap directly above the
registered target for the headed screenshot. Call `clear(slug)` before editing
the next visual state. The API is DEV-only and every registration must unregister
on preview unmount.

## Decompose every element into atomic layers

**No visible element may be one baked composite image.** Every element is built
bottom-up from its smallest constituents, each a separate layer/asset that has
its own isolated `/ui-kit/<slug>` preview. Then, and only then, assemble.

- A skill node is **not** one picture. It decomposes into: the medallion/socket
  ring, the coloured energy fill, and a **bare glyph** (the symbol alone, on a
  fully transparent background) layered on top. The glyph asset must contain
  only the symbol — never a disc, ring, frame, or filled background baked in.
  If a source asset bundles disc + glyph, slice the bare glyph out first.
- The same applies to buttons (frame slice + label), panels (frame slices +
  content), the header (frame + separate nav icons), badges, and connectors.
- Build and eyeball each atomic part on its own page before composing the next
  level up; a parent only positions its children, it never bakes them.
- Reason it forces on you: you cannot recolour, reskin, animate, or state-swap a
  layer that is fused into a bigger picture. Fused art also double-draws (a baked
  disc hides the medallion beneath it) and can never pixel-match the reference.

Work strictly from particular to general: atomic layer → element → column → panel.
Never try to fix a whole composite interface at once.

## Never fake painted graphics with `border-image`

**Never use `border-image` (or a plain CSS `border`) to stand in for a painted,
sliced graphic** — a frame, ornament, medallion, socket, or any decorated edge.
Those are art: render them from their real sliced image assets as positioned
`<img>` (or `background-image`), 9-sliced into `<img>` pieces when a corner/edge
must not stretch. If a full frame slice exists (e.g. `ornate-large.png`), slice
and place it, never approximate it with `border-image`.

This ban is narrow. Ordinary `border` (a genuine hairline divider), `outline`
(`:focus-visible` rings), and `box-shadow` (real drop shadows / glows) remain
fine for what they actually are — do not extend this into a blanket prohibition.

## Do not do this

- Do not fake a painted frame/ornament/socket with `border-image`; use the sliced
  image asset. See "Never fake painted graphics with `border-image`".
- Do not create a `main-menu` vertical feature when it is only a route screen;
  place it in `app/ui/main-menu` and compose UI-kit elements.
- Do not let a UI-kit component import feature-local assets, localization or
  gameplay systems.
- Do not duplicate a generic button/panel in a screen once UI-kit already owns
  it.
- Do not store runtime PNGs in root `assets/`, `features/<slice>/assets/`, or
  `ui-kit/assets/` unless that directory is the direct owner that imports them.
