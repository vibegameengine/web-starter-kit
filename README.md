# Web Starter Kit

An opinionated **Vite + React 19 + TypeScript** starter kit distilled from a
production browser game. It packages the parts that are painful to get right the
first time — a build-time asset optimizer pipeline, an automatic (manifest-free)
preloader, and a two-stage readiness gate — as a clean, reusable foundation.

> Provenance: extracted from the `cozy-solitaire` game pipeline. The game code
> itself is not included; only the reusable build/tooling/bootstrap experience.

## Why this exists

Most "React + Vite" templates stop at HMR and ESLint. Shipping a real browser
app (especially a game) needs more, and every project re-solves the same
problems:

- Which assets must finish loading before the first frame, and how do you keep
  that list in sync as the code changes?
- How do you shrink audio and images at build time without a fragile prebuild
  step?
- How do you hold a loading screen until the app is *actually visually ready*,
  not just until bytes arrive?

This kit answers all three, out of the box.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

The demo screen ([src/demo/DemoScreen.tsx](src/demo/DemoScreen.tsx)) is a live
proof of the pipeline: it lists the exact assets the build collected for
preloading and only appears once it has painted its first frame.

```bash
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # serve the production build
npm run lint       # eslint
npm run test       # vitest + coverage
npm run knip       # dead files / exports report
npm run e2e        # Playwright smoke test
```

## What's inside

| Capability | Where |
| --- | --- |
| Auto-collected asset preloader (no manifest) | [vite/bootstrapAssetRegistryPlugin.ts](vite/bootstrapAssetRegistryPlugin.ts) |
| Build-time MP3 optimizer + clip-safe normalization | [vite/audioAssetOptimizerPlugin.ts](vite/audioAssetOptimizerPlugin.ts) |
| Imagetools dev-cache middleware | [vite/imagetoolsDevCachePlugin.ts](vite/imagetoolsDevCachePlugin.ts) |
| Image transforms + lossy optimization | `vite-imagetools` + `vite-plugin-image-optimizer` in [vite.config.ts](vite.config.ts) |
| React Compiler (Babel preset) | [vite.config.ts](vite.config.ts) |
| Two-stage readiness gate | [src/bootstrap/](src/bootstrap/) |
| Version injected from `package.json` | `__APP_VERSION__` define + [src/config/appVersion.ts](src/config/appVersion.ts) |
| Version bump tooling | [scripts/bump-version.ts](scripts/bump-version.ts) |
| Strict TS project refs, flat ESLint, Vitest (coverage), Playwright, Knip | root configs |

See [docs/pipeline.md](docs/pipeline.md) for a deep dive on each piece and the
hard-won reasons behind the defaults, and [docs/architecture.md](docs/architecture.md)
for the source-layout conventions. [FEATURES.md](FEATURES.md) tracks exactly
which pieces of the original game pipeline were carried over.

For agent collaboration rules, see [AGENTS.md](AGENTS.md) and
[agents/WORKFLOW.md](agents/WORKFLOW.md).

## The readiness gate in 30 seconds

```tsx
import { BootstrapGate, useReportInitialRenderReady } from './bootstrap'

function FirstScreen() {
  useReportInitialRenderReady() // dismisses the overlay after the first paint
  return <YourApp />
}

createRoot(root).render(
  <BootstrapGate
    prepareSteps={[/* init SDKs, resolve locale, load fonts */]}
    finalizeSteps={[/* hydrate a saved profile */]}
  >
    <FirstScreen />
  </BootstrapGate>,
)
```

Flow: **prepare steps → preload blocking assets → finalize steps → mount the app
hidden under the overlay → wait for its first real frame → fade the overlay
out.** Progress is monotonic and adapts to which optional stages you provide.
Everything is optional; with no props it just preloads and reveals.

## Deployment

`base: './'` is set in [vite.config.ts](vite.config.ts) so the built bundle is
portable across static hosts that serve from a sub-path (itch.io, Yandex Games
S3, GitHub Pages, plain file servers). Change it if you deploy at a fixed root.

## Requirements

Node 20+. The audio optimizer decodes/encodes MP3 with `mpg123-decoder` and
`lamejs`; image optimization uses `sharp` and `svgo`. All are dev dependencies —
none ship in your bundle.
