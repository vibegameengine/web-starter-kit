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
7. Add a co-located `preview.tsx` exporting `uiKitPreview`; the DEV `/ui-kit`
   sidebar discovers these modules automatically and renders one selected public
   component at a time on the neutral grey canvas.
8. Run focused lint, confirm bootstrap assets, and verify both the `/ui-kit`
   preview and the composed screen in a headed browser.

## Mandatory isolated visual gate

Never accept a UI-kit component from source inspection, a unit test, or an
in-world frame alone. Open `/ui-kit` in a headed browser, select the component
from the sidebar, inspect it at its preview size, and exercise every interactive
state. Add the preview in the component folder when creating a public component;
the sidebar's `import.meta.glob('../*/preview.tsx')` registry is the only
discovery mechanism.
Keep preview props deterministic and self-contained: no router, game state,
network data, or active 3D scene.

## Do not do this

- Do not create a `main-menu` vertical feature when it is only a route screen;
  place it in `app/ui/main-menu` and compose UI-kit elements.
- Do not let a UI-kit component import feature-local assets, localization or
  gameplay systems.
- Do not duplicate a generic button/panel in a screen once UI-kit already owns
  it.
- Do not store runtime PNGs in root `assets/`, `features/<slice>/assets/`, or
  `ui-kit/assets/` unless that directory is the direct owner that imports them.
