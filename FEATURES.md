# Transfer checklist

What was carried over from the origin game pipeline into this starter kit, what
was adapted to be reusable, and what was deliberately left behind (with the
reasoning, so you can re-add it if your project needs it).

Legend: ✅ transferred · 🔧 transferred + decoupled/generalized · ⛔ excluded on purpose

## Build pipeline & config — fully transferred

| Piece | Status | Notes |
| --- | --- | --- |
| `vite.config.ts` (plugin wiring, `base: './'`, `define`) | ✅ | Coverage `include` re-scoped to the kit's tested modules |
| `bootstrapAssetRegistryPlugin` | ✅ | Verbatim |
| `imagetoolsDevCachePlugin` | ✅ | Verbatim |
| `audioAssetOptimizerPlugin` | 🔧 | Path match generalized: `src/**/assets/audio/*.mp3` (was `src/features/**`) |
| `vite-imagetools` + `vite-plugin-image-optimizer` | ✅ | Same quality settings |
| React Compiler (`@rolldown/plugin-babel` + preset) | ✅ | Verbatim |
| `__APP_VERSION__` define from `package.json` | ✅ | Surfaced via `src/config/appVersion.ts` |
| `tsconfig.json` / `.app.json` / `.node.json` | ✅ | `node` config also includes `vite/` + `scripts/` |
| `eslint.config.js` (flat) | ✅ | Verbatim |
| `knip.json` | ✅ | Verbatim |
| `playwright.config.ts` | ✅ | Dropped the game's `ru-RU` locale default |
| Vitest coverage config | 🔧 | Generic include/exclude instead of the game's file list |
| `vite-env.d.ts` module declarations | 🔧 | Kept the reusable ones (`virtual:bootstrap-assets`, `?audio-optimize=off`, `*.glb?url`); dropped the game-only `stats.module` shim |
| `index.html` | 🔧 | Removed the `sdk.js` (platform SDK) script tag |

## Bootstrap / readiness gate — transferred & decoupled

| Piece | Status | Notes |
| --- | --- | --- |
| `bootstrapAssetRegistry.ts` | ✅ | Verbatim |
| `preloadBootstrapAssets.ts` | ✅ | Verbatim (parallel fetch + image-decode warming) |
| `initialRenderReady.ts` | ✅ | Verbatim |
| `bootstrapPhase.ts` | 🔧 | Phases generalized (`prepare/assets/finalize/render/ready/failed`) |
| `bootstrapProgress.ts` | 🔧 | Rewritten as an adaptive, monotonic progress plan (was hardcoded per game phase) |
| `BootstrapGate.tsx` | 🔧 | Now driven by optional `prepareSteps` / `finalizeSteps`; no dependency on platform SDK, i18n, fonts, or profile |
| `GamePreloader` → `BootstrapPreloader` | 🔧 | CSS-only logo mark (was a game coin image), string-prop labels instead of i18n |
| Render-request context + provider + hook | ✅ | Verbatim |
| `useReportInitialRenderReady()` | 🆕 | New convenience hook (double-rAF); the game called `reportInitialRenderReady` by hand |

## Tooling — transferred

| Piece | Status | Notes |
| --- | --- | --- |
| `scripts/bump-version.ts` + test | ✅ | Messages translated to English |
| `version:major/minor/patch` npm scripts | ✅ | Verbatim |

## Deliberately excluded — not part of the reusable Vite pipeline

These are app/game-specific. Each note says where you'd reintroduce it.

| Piece | Status | Why excluded / how to re-add |
| --- | --- | --- |
| Yandex publishing (`scripts/yandex-*`, `scripts/yandex/`, `generate-yandex-assets`) | ⛔ | Single-platform release tooling. Add per target platform as small, focused scripts. |
| Profiling scripts (`cdp-*.mjs`, `profile.mjs`, `cdp-village-worker-profile`) | ⛔ | Tied to the game's WebGL scene + debug overlay. |
| Asset scripts (`extract-village-props`, `convert-staging-audio`, `simulate-run-gold`) | ⛔ | Game content/economy tooling. |
| `@vibegameengine/platform`, `@vibegameengine/ui-scaler` | ⛔ | Platform SDK + viewport scaler. Plug platform init in as a `prepareStep`. |
| `three`, `@react-three/fiber`, `@react-three/drei` | ⛔ | 3D engine. Add when you build a WebGL scene. |
| `howler` audio runtime | ⛔ | Runtime playback, not build pipeline. The **build-time** MP3 optimizer *is* included. |
| `zustand`, `react-router-dom` | ⛔ | State/routing are app choices; kept the kit unopinionated. |
| `@fontsource/pt-serif` | ⛔ | A specific bundled font. The pattern (bundle fonts, load before first paint via a `prepareStep`) is documented in [docs/pipeline.md](docs/pipeline.md). |
| `@gltf-transform/*` | ⛔ | 3D model optimization, used only by a game script — not wired into the Vite build. |
| i18n system, profile bootstrap, render-quality settings | ⛔ | App-specific runtime. The gate exposes `prepareSteps`/`finalizeSteps` as the seams to add them. |

## How to re-verify this list

```bash
# Confirm the kit builds, lints, tests, and has no dead files.
npm install && npm run lint && npm run test && npm run knip && npm run build
```

The three plugins and the bootstrap `systems/` are the load-bearing transfer; if
those build and the demo screen preloads + reveals, the pipeline came over
intact.
