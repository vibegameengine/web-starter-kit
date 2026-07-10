# Three.js Game Starter Kit

An **AI-agent-native** foundation for shipping browser games with
Vite 8 · React 19 · TypeScript · Three.js.

![Three.js scene — an animated character beside a reflective canal and a ruined colonnade under soft directional light](docs/screenshot.png)

## Why this kit

Two things, and they're the whole point.

### 🧠 A ton of skills & roles

The repo is built to be **driven by coding agents**. It ships **8 specialist
roles** and **30+ composable skills** — pick a role, load the skills the task
needs, ship.

- **8 roles** ([`agents/`](agents/AGENTS.md)) — game-design · system-design ·
  product-design · narrative-design · motion-design · programmer ·
  platform-publishing · manager.
- **This kit's own skills** — `asset-optimization-pipeline` (the web build
  pipeline below), plus project skills for Three.js scene authoring, instancing,
  frame-cost architecture and the FSD/ECS layout.
- **A full 3D-asset pipeline** ([`agents/skills/`](agents/skills/)) — Blender
  modeling, materials, lighting, rendering, rigging and export; reference-locked
  reconstruction; UV & texture fitting; animation QA. **Vendored from
  [RobLe3 / cc-blender-skill](https://github.com/RobLe3/cc-blender-skill) (MIT)** —
  not our work, included and credited here.
- Skills auto-symlink into `.claude/skills` and `.codex/skills`; roles and the
  workflow contract live in [`agents/AGENTS.md`](agents/AGENTS.md).

### ⚡ Build-time & runtime optimization

Everything is optimized on **both** axes — assets are crushed at build, frames
stay cheap at runtime.

- **Build (static)** — assets shrink as they enter the import graph, no prebuild
  step, no manual manifest:
  - GLB/glTF repacked via glTF-Transform — WebP textures, `?albedo`
    (base-color only), `?meshopt` geometry/animation compression, all tuned
    per-import. A rigged character goes **5.2 MB → 0.7 MB (−87%)**:
    ```ts
    import npc from './npc.glb?texture=1024&albedo&meshopt'
    ```
  - MP3 re-encode + clip-safe normalization; image transforms + lossy optimize.
  - A **manifest-free preloader** walks the import graph, collects every
    reachable asset, and gates the first frame — byte-weighted progress.
- **Runtime (dynamic)** — instanced draw calls from one shared material/geometry
  registry, a **static/dynamic render split** with throttled baked shadows, and
  N8AO + bloom + ACES post running at `dpr 1` for a flat frame budget.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 — drag to orbit
npm run build      # tsc -b && vite build -> dist/
npm run test       # vitest + coverage
npm run lint       # eslint · npm run knip — dead-code report · npm run e2e — Playwright
```

## What's inside

| Capability | Where |
| --- | --- |
| 30+ agent skills + 8 roles | [agents/](agents/AGENTS.md) · [agents/skills/](agents/skills/) |
| GLB/glTF optimizer — textures, Meshopt, albedo-only, per-import flags | [vite/glbAssetOptimizerPlugin.ts](vite/glbAssetOptimizerPlugin.ts) |
| Manifest-free asset preloader | [vite/bootstrapAssetRegistryPlugin.ts](vite/bootstrapAssetRegistryPlugin.ts) |
| MP3 optimizer + clip-safe normalization | [vite/audioAssetOptimizerPlugin.ts](vite/audioAssetOptimizerPlugin.ts) |
| Image transforms + optimize + dev cache | [vite.config.ts](vite.config.ts) |
| Instancing + shared material/geometry registry | [src/features/world/](src/features/world/entities/Blockout.tsx) |
| Static/dynamic render split + throttled shadows | [src/shared/lib/](src/shared/lib/ShadowGroup.tsx) |
| Two-stage readiness gate | [src/features/bootstrap/](src/features/bootstrap/) |
| Strict TS refs · flat ESLint · Vitest · Playwright · Knip · React Compiler | root configs |

## Architecture

`src/` is **Feature-Sliced Design** on the outside, a **Unity-style ECS** inside
each feature — *entity* (a component that is a game being), *component* (a hook
you attach), *system* (pure, tested logic). Scenes are the composition root;
`app → scenes → features → shared` is never violated. Details in
[docs/architecture.md](docs/architecture.md), pipeline deep-dive in
[docs/pipeline.md](docs/pipeline.md).

## Deployment

`base: './'` keeps the build portable across static hosts (itch.io, Yandex Games,
GitHub Pages, plain file servers). Serve `.glb` with gzip/brotli for the smallest
transfer. All optimizers are **dev dependencies — nothing ships in your bundle.**
Requires Node 20+.
