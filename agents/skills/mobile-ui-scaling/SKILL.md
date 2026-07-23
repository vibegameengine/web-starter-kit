---
name: mobile-ui-scaling
description: >-
  How to correctly make UI scale on mobile in this project. The app scales every
  UI screen with the external ScalableContainer (@vibegameengine/ui-scaler):
  content is authored in a fixed logical `targetWidth` and shrunk by
  `transform: scale(min(1, innerWidth/targetWidth))`. On a phone a desktop-width
  target collapses the UI to ~30% (tiny, unreadable). The ONE correct fix is a
  DYNAMIC targetWidth per device via the shared `useResponsiveTargetWidth` hook —
  never remove the scaler, never patch it with per-element `transform: scale(N)`
  compensation, never invent a new scaling system. MANDATORY whenever a screen is
  "too small / doesn't scale / broken on mobile", when touching `targetWidth`,
  ScalableContainer, a HUD/menu/overlay on mobile, or any responsive UI work.
  Trigger on: "mobile UI", "doesn't scale on phone", "too small on mobile",
  "targetWidth", "ScalableContainer", "adaptive UI", "responsive", "portrait",
  "HUD too big/small on mobile", "меню не скейлится", "плашка на мобилке".
---

# Mobile UI scaling — dynamic targetWidth, verified by eye

## The system (do NOT replace it)

Every UI screen is wrapped in `ScalableContainer` from `@vibegameengine/ui-scaler`.
It renders one `position:absolute; transform-origin:top-left` div, sizes its logical
canvas to `targetWidth`, and applies `scale = min(1, window.innerWidth / targetWidth)`
(**it only ever scales DOWN, never up**). UI is authored in large logical px (menu
1448, HUD 1280) and shrunk to fit.

This is the project's scaling system. **Keep it.** Do not rip out `ScalableContainer`,
do not rewrite screens as bespoke `@media`/`rem` layouts, do not add a second scaler.

## The one correct fix

A screen that is "too small / doesn't scale" on a phone has a **desktop `targetWidth`
hardcoded**. On a 390px phone `scale = 390/1280 ≈ 0.30`, so everything is 30% size.
Fix it by making `targetWidth` **dynamic per device** — a smaller target on a narrow
portrait phone keeps the on-screen scale near 1, so the UI fills the screen and stays
legible.

Use the shared hook — never duplicate the logic, never hardcode:

```tsx
import { useResponsiveTargetWidth } from '../../../shared/lib/ui-scale/useResponsiveTargetWidth'

const targetWidth = useResponsiveTargetWidth({ desktop: 1448, mobilePortrait: 640 })
// ...
<ScalableContainer targetWidth={targetWidth} zIndex={2}>
```

`src/shared/lib/ui-scale/useResponsiveTargetWidth.ts` picks `mobilePortrait` when
`innerWidth <= 720 && innerHeight >= innerWidth`, else `desktop`, and reacts to
`resize` / `orientationchange`.

### Per-screen values
- **Only shrink the target where the screen is genuinely broken.** A screen that
  already looks right on mobile keeps `mobilePortrait === desktop` (identical to
  before) — the hook stays for consistency but changes nothing.
- Current production values: **main menu** `{ desktop: 1448, mobilePortrait: 640 }`
  (was collapsing → now fills the screen); **combat HUD** `{ desktop: 1280,
  mobilePortrait: 1280 }` (was already correct → left identical). See
  `src/app/ui/main-menu/MainMenuScreen.tsx` and
  `src/features/combat/ui/GameHud/GameHud.tsx`.
- A screen with more elements (HUD) needs a larger mobile target than a sparse one
  (menu); tune the number by eye, not by formula.

## Forbidden (these are the "костыли с обратным scale")
- ❌ Per-element compensation like `.defeat { transform: scale(2) }` to "un-shrink"
  one panel. If a panel is too small, the whole screen's `targetWidth` is wrong —
  fix the target, delete the hack.
- ❌ Removing `ScalableContainer` / replacing the transform-scale system.
- ❌ Duplicating `computeMenuTargetWidth`-style logic in a screen. Use the shared hook.

## Runtime is scale-independent (no logic changes needed)
Touch/combat input does NOT depend on the scale factor: virtual sticks report unit
direction vectors, and every world raycast / tap goes through the **canvas** rect,
which is a full-window sibling of the scaler (outside the transform). Self-derived
`scale` fields in `InventoryGridPanel` / `MerchantStockGrid` / `VirtualStick`
collapse to 1 and stay correct. Changing `targetWidth` is a **visual-only** change.

## MANDATORY verification — by eye, headed, both states

Per AGENTS.md #1, never claim a mobile layout "looks right" from `tsc`/build/code.

1. **Capture a reference BEFORE you change anything.** Screenshot the current
   (correct or broken) screen on a mobile viewport first, so you can compare after.
   Skipping this is the #1 mistake — you cannot match "identical to before" without it.
2. Drive a **headed** browser (`chromium.launch({ headless: false })`, never headless)
   against the **already-running** dev server on `:5173` (never kill/restart it — see
   `never-kill-dev-server`). Mobile viewport, e.g. `{ width: 390, height: 844 }`,
   `isMobile: true, hasTouch: true`.
3. Reach the real screen:
   - Menu: `http://localhost:5173/`
   - Combat HUD: `http://localhost:5173/play?class=ember` (bare `/play` renders
     nothing — it needs `?class=`). Wait for `canvas` + ~12s for the dungeon + HUD.
   - The death plaque (`!alive && encounterStatus === 'defeat'`) only draws after a
     real defeat; confirm on device or force the state for one dev frame.
4. Screenshot into `docs/shots/`, **open the image and look**. Compare against the
   reference. Verify mobile fills/reads correctly AND desktop (e.g. 1440×900) is
   unchanged.

## Save artifacts in-repo
Verification shots → `docs/shots/`. Throwaway Playwright scripts run from the repo
root (so `node_modules` resolves) and are deleted after.

Related: memory `mobile-scale-dynamic-targetwidth`; skills `patch9-ui` (box-driven
chrome already follows element size), `ui-kit-architecture`, `fsd-ecs-architecture`.
