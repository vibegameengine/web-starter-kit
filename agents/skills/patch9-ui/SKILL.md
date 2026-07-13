---
name: patch9-ui
description: >-
  Build, slice, and repair responsive game UI in this project with the shared
  Patch9Button/Patch9Surface renderer. Use whenever creating or changing a HUD,
  main menu, modal, panel, framed button, UI atlas crop, or a UI overlay that
  must stay clickable inside ScalableContainer. Covers FSD placement, asset
  slicing, Patch9 inset configuration, interaction rules, and headed validation.
---

# Patch9 UI — sliced frames, responsive layout, real interactions

Use the isolated UI-kit renderer at
`src/features/ui-kit/components/Patch9Button/Patch9Button.tsx`; never recreate
9-slice canvas drawing in a screen or vertical feature. Screens compose the
public UI-kit API and must not own Patch9 image/configuration details.

## Workflow

1. Before adding files under `src/`, load `fsd-ecs-architecture`; before copying
   or importing images, load `asset-optimization-pipeline`.
2. Put a feature screen in `features/<slice>/ui/` or a domain-free route screen
   in `app/ui/<screen>/`. Put reusable UI in the isolated `features/ui-kit`.
   The starter scene's visible overlay belongs in
   `ui-kit/components/DemoSceneHud/`; its Patch9 actions belong in their own
   component folders below `ui-kit/components/`.
   Keep a UI asset next to the component that imports it: for example,
   `ui-kit/components/MenuButton/assets/` for button states and
   `ui-kit/components/MenuPanel/assets/` for panel art. Do not create a shared
   asset bucket detached from its consumer. A truly common asset belongs in
   `shared/<owner>/assets/`, imported by that shared owner. Add routes in
   `app/router/AppRouter.tsx`.
3. Cut an atlas into one transparent PNG per reusable state: normally default
   button, active button, disabled button, and panel. Never import runtime UI
   directly from `concepts/` or another staging directory.
4. Configure the Patch9 source slice and destination border, then lay out the
   screen with CSS Grid/Flex. Use explicit screen states and working actions.
5. Ensure each sliced image is a blocking entry in `virtual:bootstrap-assets`,
   gate bootstrap readiness on Patch9 rendering, add the component's
   co-located `preview.tsx`, then run focused lint. Inspect `/ui-kit` in a
   headed browser before the composed route and click every interactive control.

## Choose the primitive

- Use `Patch9Button` for an action. It renders a semantic `<button>`, supports
  `disabledImage`, and owns hover/pressed/disabled behavior.
- Use `Patch9Surface` for a non-interactive frame, card, or panel. Do not use
  it as a fake button; place a real button inside instead.

```tsx
import { Patch9Button, Patch9Surface } from '../../ui-kit/components/Patch9Button/Patch9Button'
import activeImage from '../assets/menu-active.png'
import panelImage from '../assets/menu-panel.png'

const BUTTON_PATCH = {
  image: activeImage,
  slice: { top: 10, right: 15, bottom: 10, left: 15 },
  border: { top: 10, right: 15, bottom: 10, left: 15 },
  textColor: '#fae4c8',
}

const PANEL_PATCH = {
  image: panelImage,
  slice: { top: 25, right: 25, bottom: 25, left: 25 },
  border: { top: 25, right: 25, bottom: 25, left: 25 },
}

<Patch9Surface className={styles.panel} patch9={PANEL_PATCH}>
  <Patch9Button className={styles.play} patch9={BUTTON_PATCH} onClick={onPlay}>
    Играть
  </Patch9Button>
</Patch9Surface>
```

## Slice correctly

`slice` is the immutable pixel inset on the source art: corners and ornament
that must not stretch. `border` is the fixed target inset: choose it close to
the rendered thickness of that ornament. The center region is the only area
that may scale.

- Crop enough transparent margin to retain every corner, spike, and shadow.
- Keep `slice.left + slice.right < source width` and the same rule vertically.
- Keep `border.left + border.right < every target width` and the same rule for
  target height; otherwise the renderer falls back to a full-image stretch.
- Store Patch9 configurations as module constants. A new object every render
  defeats caching and causes needless canvas work.
- Let the built-in `ResizeObserver` redraw when a responsive panel changes
  size; do not force background-size hacks over its generated image.

## Make an overlay clickable

`ScalableContainer` deliberately sets `pointer-events: none` so a game canvas
can receive input. Restore events on the first child that owns UI interaction:

```css
.shell {
  position: relative;
  width: 1448px;
  min-height: 1086px;
  pointer-events: auto;
}

.backdrop,
.decorativeArt {
  pointer-events: none;
}
```

Keep decorative artwork inert. Use a high enough `zIndex` for the overlay, and
do not put an invisible full-screen scrim above buttons unless it intentionally
blocks input. If only selected regions are interactive, keep the screen shell
inert and set `pointer-events: auto` on those regions explicitly.

## Gate first reveal on Patch9 generation

The bootstrap overlay must remain visible until every mounted Patch9 canvas
image has been generated. Use the shared wait function in
`useReportInitialRenderReady`; do not report readiness after only two animation
frames.

```tsx
import { useLayoutEffect } from 'react'

import { waitForPatch9ImagesReady } from '../../ui-kit/components/Patch9Button/patch9ImageRenderer'
import { reportInitialRenderReady } from '../systems/initialRenderReady'

useLayoutEffect(() => {
  if (requestId === 0) return

  let isCancelled = false
  let firstFrame = 0
  let secondFrame = 0

  firstFrame = requestAnimationFrame(() => {
    secondFrame = requestAnimationFrame(() => {
      void waitForPatch9ImagesReady().then(() => {
        if (!isCancelled) reportInitialRenderReady(requestId)
      })
    })
  })

  return () => {
    isCancelled = true
    cancelAnimationFrame(firstFrame)
    cancelAnimationFrame(secondFrame)
  }
}, [requestId])
```

`waitForPatch9ImagesReady()` drains all cache entries that are still rendering;
it is a no-op for screens without Patch9. Keep the wait in the shared hook so
every UI screen receives the same no-flash contract.

The asset registry walks static imports from `src/main.tsx`, so an eagerly
routed Patch9 screen is preloaded automatically. In dev, its virtual module
must be invalidated when source imports change; otherwise a long-lived server
can retain an old manifest and omit newly added PNGs until restarted.

## UI quality rules

- Give every primary action a real outcome: navigate, mutate state, or show an
  explicit unavailable message. Do not leave dead buttons.
- Use `disabled` for unavailable actions; do not emulate it with a click that
  silently does nothing.
- Keep decorative images `alt=""`; give icon-only controls `aria-label`.
- Restore a local `:focus-visible` treatment because the project suppresses
  generic browser focus rings.
- Never add a canvas or Three.js scene just to decorate a menu. Use the supplied
  UI assets and CSS unless a scene was explicitly requested.

## Verification

1. Run `npx eslint` on the changed feature and route.
2. Open the DEV `/ui-kit` sidebar in a headed browser. Select every changed
   primitive and inspect its isolated neutral-grey canvas before using an
   in-world frame as supplementary evidence; no source-only or build-only
   approval is valid.
3. Confirm `virtual:bootstrap-assets` lists every sliced PNG as non-deferred,
   then confirm Vite serves each one without a 404.
4. Open the affected route in a headed browser. Confirm the preloader remains
   visible until every frame has its Patch9 artwork, then inspect panel corners
   at the smallest and widest supported viewport.
5. Click every button, including keyboard focus/Enter. Verify that no canvas,
   scaler wrapper, backdrop, or scrim intercepts the action.
6. Run the repository validation commands when feasible; report pre-existing
   failures separately from the UI change.
