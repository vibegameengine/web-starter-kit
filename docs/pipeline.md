# The pipeline, and why it's built this way

Every default here was paid for in a shipping game. This document explains what
each piece does and the failure it prevents, so you can keep or drop it with
open eyes.

## 1. Auto-collected asset preloader

**Plugin:** [`vite/bootstrapAssetRegistryPlugin.ts`](../vite/bootstrapAssetRegistryPlugin.ts)
· **Runtime:** [`src/bootstrap/systems/`](../src/bootstrap/systems/)

A hand-maintained preload manifest rots the moment someone adds an asset and
forgets to list it. Instead, the plugin walks the **static** import graph from
the entry (`/src/main.tsx`), collects every reachable asset (images, audio,
fonts…), and exposes them through a virtual module:

```ts
import { bootstrapAssetEntries } from 'virtual:bootstrap-assets'
```

Rules that make this safe:

- **Blocking by default.** Anything statically imported is considered required
  for the first frame.
- **Explicit opt-out.** Append `?bootstrap=deferred` (or `?deferred`) to an
  import to keep it out of the blocking set. The audio optimizer tags its
  output `deferred` automatically, since audio rarely needs to block paint.
- **Lazy imports never enter the graph.** Route/screen chunks loaded via
  `import()` are excluded for free — only what the first screen truly needs is
  blocking.

The runtime side ([`preloadBootstrapAssets.ts`](../src/bootstrap/systems/preloadBootstrapAssets.ts))
fetches everything in parallel and, crucially, **warms image decode** via
`Image.decode()`. Fetching bytes is not enough: a canvas- or
`background-image`-backed UI will still pop a frame after mount if the browser
hasn't decoded the image yet. Weighting is by byte size, so the progress bar
tracks real work, not file count.

## 2. Two-stage readiness gate

**Component:** [`src/bootstrap/ui/BootstrapGate.tsx`](../src/bootstrap/ui/BootstrapGate.tsx)

The overlay must not disappear the instant bytes finish downloading — that
reveals a blank or half-built screen. The gate runs two stages:

1. **Preload stage** — run `prepareSteps`, preload blocking assets, run
   `finalizeSteps`. The overlay is opaque the whole time.
2. **Render stage** — mount the app subtree *hidden underneath the overlay*,
   then wait for it to call `useReportInitialRenderReady()`. That hook waits two
   animation frames (long enough for a real paint) and signals the gate, which
   fades the overlay out.

This is the difference between "the loader vanished and then the game appeared"
and a seamless reveal. `waitForInitialRender={false}` skips stage 2 if you don't
need it.

Progress is **monotonic** — a later phase can never move the bar backwards
([`bootstrapProgress.ts`](../src/bootstrap/systems/bootstrapProgress.ts)) — and
the bands adapt to which optional stages exist, so the bar never jumps to 50% on
start or strands a gap at the end.

`prepareSteps` / `finalizeSteps` are where app-specific concerns plug in
(platform SDK init, locale resolution, font loading, profile hydration) without
the gate itself depending on any of them.

## 3. Build-time audio optimizer

**Plugin:** [`vite/audioAssetOptimizerPlugin.ts`](../vite/audioAssetOptimizerPlugin.ts)

Re-encodes `src/**/assets/audio/*.mp3` during the build — no separate prebuild
CLI step, no committed optimized copies to drift out of sync. Decisions:

- **Bitrate by duration.** Tracks ≥ 12s keep stereo at 96 kbps; short SFX
  collapse to mono at 64 kbps.
- **Clip-safe, artistic-safe normalization.** A two-pass process guarantees the
  compressed peak stays at or below `0.97` (no output clipping) but **never
  boosts quiet audio** (`gain > 1.0` is forbidden), preserving the mix's
  loudness balance. Pass one scales down only if the source already clips; pass
  two re-checks the *encoded* peak (lossy encoding can overshoot) and corrects.
- **Never regresses.** If re-encoding wouldn't shrink a file and no
  normalization was needed, the original bytes are kept untouched.
- **Per-file escape hatch.** Import with `?audio-optimize=off` to ship a
  sensitive asset verbatim.

Works in both `serve` (served via a dev middleware URL) and `build` (emitted
asset). **Restart the dev server after editing the plugin** — Vite keeps the old
plugin code in memory otherwise.

## 4. Image transforms + optimization + dev cache

**Config:** [`vite.config.ts`](../vite.config.ts) · **Dev cache:**
[`vite/imagetoolsDevCachePlugin.ts`](../vite/imagetoolsDevCachePlugin.ts)

- `vite-imagetools` gives you per-import transforms:
  `import url from './pic.png?w=192&format=webp'`.
- `vite-plugin-image-optimizer` losslessly/lossily compresses raster + SVG
  output at build time (PNG/JPEG/WebP at q82, AVIF at q60).
- The dev-cache plugin serves previously computed imagetools variants straight
  from `node_modules/.cache/imagetools`, so repeated requests in dev skip the
  sharp round-trip.

## 5. React Compiler

`@vitejs/plugin-react` + `@rolldown/plugin-babel` running
`babel-plugin-react-compiler`. Auto-memoizes components so you write plain
React and still get stable renders — important when a heavy scene re-renders on
every state tick.

## Configuration reference

- **TypeScript** — three-file project-reference setup
  (`tsconfig.json` → `tsconfig.app.json` for the browser app,
  `tsconfig.node.json` for Vite/scripts). Strict, `noUnusedLocals/Parameters`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, bundler resolution.
- **ESLint** — flat config with `typescript-eslint`, `react-hooks`, and
  `react-refresh` recommended sets.
- **Vitest** — jsdom environment, V8 coverage with an 80% threshold scoped to
  the pure, framework-free logic (bootstrap systems + scripts). UI, the entry,
  and the demo are covered by the build and Playwright instead.
- **Playwright** — Chromium smoke test that boots the dev server and verifies
  the gate reveals the app.
- **Knip** — dead file/export report (`npm run knip`).
