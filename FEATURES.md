# Transfer checklist

What was carried over from the origin game pipeline into this starter kit, what
was adapted to be reusable, and what was deliberately left behind (with the
reasoning, so you can re-add it if your project needs it).

Legend: ✅ transferred · 🔧 transferred + decoupled/generalized · ⛔ excluded on purpose

## Build pipeline & config — fully transferred

| Piece | Status | Notes |
| --- | --- | --- |
| `vite.config.ts` (plugin wiring, `base: './'`) | ✅ | Coverage `include` re-scoped to the kit's tested modules |
| `bootstrapAssetRegistryPlugin` | ✅ | Verbatim |
| `imagetoolsDevCachePlugin` | ✅ | Verbatim |
| `audioAssetOptimizerPlugin` | 🔧 | Path match generalized: `src/**/assets/audio/*.mp3` (was `src/features/**`) |
| `vite-imagetools` + `vite-plugin-image-optimizer` | ✅ | Same quality settings |
| React Compiler (`@rolldown/plugin-babel` + preset) | ✅ | Verbatim |
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

## DEV lab library + physics ragdoll — transferred

Carried over from the origin game as one piece, because a lab with no stage and a
ragdoll with no bench are both unusable on their own.

| Piece | Status | Notes |
| --- | --- | --- |
| DEV lab contract + registry + router (`shared/lib/devLab.ts`, `app/labs/`) | ✅ | Labs are found by globbing `features/*/ui/*.lab.ts`; adding a lab is never a router edit. The whole subtree hangs off one `import.meta.env.DEV` guard, so labs and their preview images are stripped from production builds. |
| `/labs` index — preview-image cards, filter, category groups | ✅ | Previews are captured with `npm run labs:previews` against a running dev server and matched to labs by filename; a lab with none shows an explicitly empty card. |
| Shared lab stage (`scenes/lab-stage/`) | 🔧 | Now uses the kit's own graphics settings and demo `Debug` panel. `makeDefault` added to its orbit controls so a lab that drags its subject can pause the camera instead of forking the stage. |
| Cached shadow rig (`shared/lib/shadows/`, `SunShadow`, `shadowLayers`) | ✅ | Ported 1:1 — the world's shadow is baked once and only tagged movers are redrawn. Replaces the kit's earlier inert layer tags and `ShadowThrottle` (kept, still used by the demo canvas). `?shadows=legacy` remains the escape hatch. |
| Fixed-tick bus (`shared/lib/simulation/FixedTick*`) | ✅ | The kit already had `fixedStep`; the provider, bus and context came with the ragdoll, which needs gameplay timing off the render frame. |
| Physics ragdoll (`features/ragdoll/`) + `@react-three/rapier` | ✅ | A capsule rigid body per limb with limited ball/hinge joints, built from any Mixamo skeleton. Off and free while off; switched on it takes the skeleton over. Simulation runs on the fixed tick, bone write-back on the render frame. |
| Ragdoll playground (`scenes/ragdoll-lab/`) | 🔧 | Rebuilt on the shared stage and extended: grab a limb and drag it, fling it on release, spin, tumble, launch, shoot, throw four solid shapes, three gravity presets, collider wireframes. |
| `default-humanoid.fbx` mannequin | ✅ | The reference rig, DEV-only: it is reachable from the lab route alone, so the production build never converts or ships it. |
| ui-kit primitives `ControlPanel`, `ControlButton`, `ControlChoice` | 🔧 | Authored in the KIT's own language, not imported: the demo scene's RENDER panel — glass surface, hairline blue border, pressed state as a lit fill — promoted out of `StarterKitShowcase` so any surface can use it. The origin game's amber nine-slice HUD components were taken out again; nothing in the kit carries its art. |
| `LabCard` | ✅ | The one component kept from the origin index. It has no assets and no game styling — a neutral documentation card, which is what the lab index is. |
| `character-debug` route | 🔧 | Became `character-debug-lab`, discovered through the registry. The old path still redirects. |

Known deviation: `character-debug-lab` keeps its own canvas instead of mounting
`LabStage`, so its lighting does not match the other labs. Converting it changes
how the demo character is lit, which is a visual decision rather than a mechanical
one — see rule 2 of `agents/skills/dev-lab-authoring/`.

## Second harvest — brought back from the game after it shipped

The first pass took the pipeline. This one took what the game learned using it,
and only where the technique is free of that game's domain.

| Piece | Status | Notes |
| --- | --- | --- |
| Audio layer (`shared/lib/audio/`) | ✅ | `audioSettings` stores and persists what the mixer could always do and nobody called; `oneShotPool` never replays the same variant twice running; `playlistOrder` is a shuffle bag, not a random pick; `sampledVoice` and `musicPlayer` are the two players over them. The random source is an argument, so order and variation are testable. |
| VFX light pool (`shared/lib/lights/`) | ✅ | A fixed set of lamps handed out by priority and apparent brightness. three.js compiles the scene's light COUNT into every material, so mounting one flash recompiled the whole scene; the pool never changes size. Opt-in per lab (`<LabStage vfxLights>`), because eight idle lamps are not free either. |
| Frame probe (`shared/lib/graphics/FrameProbe.tsx`) | 🔧 | DEV seam that publishes per-pass frame cost from inside the renderer. The game's probe driver, graph and verdict scripts stayed with the game — this is the instrument, not the bench. |
| Fixed-tick `alpha()` (`shared/lib/simulation/fixedTickBus.ts`) | ✅ | The clock computed the leftover accumulator and threw it away, so an interpolating renderer had to guess it from its frame delta — a guess that saturates at 1 whenever the display is slower than the simulation, silently disabling interpolation. |
| Shadow fallback reason (`shared/lib/shadows/`) | ✅ | The DEV line said "fallback" and left the reader to guess between an unsupported renderer, an untagged scene and a second casting light. |
| Skeletal animation maths (`shared/lib/animation/`) | ✅ | Two-bone IK, per-bone additive clip layers, aim damping, foot placement. Lifted out of the game's `features/mob/systems/`; imports `three` types and nothing else. |
| Ragdoll bind pose (`features/ragdoll/systems/mixamoRig.ts`) | ✅ | `poseToBind` normalizes a bind pose that `?meshopt` requantised — without it a ragdoll measures giant capsules and the body doubles in size on death. The fix is in the consumer; the optimizer keeps running. |
| Settings surface (`features/ui-kit/`) | ✅ | `ControlSlider`, `SettingsSection`, audio and video panels, `PauseMenu`, each with a gallery preview. |
| Shared glTF cleanup (`scripts/lib/gltfCleanup.mjs`) | ✅ | `flatten()` plus a leaf-pruning `prune()` had been deleting sockets and Mixamo end bones from every model both Vite plugins touched. One definition now, imported by both, with each plugin's cache version bumped so nothing stale survives the change. |
| Agent rules, git guard, optimization knowledge core | ✅ | `AGENTS.md` rules 0–8, an opt-in `PreToolUse` hook that refuses the git commands with no undo (and allows their safe forms; copy `.claude/settings.example.json` to enable it), and the measurement discipline behind the frame-cost work. |
| Rigging and ragdoll notes (`docs/ragdoll-and-animation.md`) | 🔧 | One document, on the technique this kit ships: the bind pose `?meshopt` rewrites, fitting capsules to a body, bone layers, additive aim, and how a bench fools its author. The seven other lesson documents that came over with it were the game's own diary and went back. |

Left with the game on purpose: the arena and its Quake-style movement, the
bestiary and its steering, blood and gib VFX, the gothic architecture kit and
every asset. Portable pieces are buried in those — the movement solver imports
nothing at all — but they arrive attached to a 60 × 60 m world singleton, and
lifting them cleanly is its own task rather than a copy.

## Deliberately excluded — not part of the reusable Vite pipeline

These are app/game-specific. Each note says where you'd reintroduce it.

| Piece | Status | Why excluded / how to re-add |
| --- | --- | --- |
| Yandex publishing (`scripts/yandex-*`, `scripts/yandex/`, `generate-yandex-assets`) | ⛔ | Single-platform release tooling. Add per target platform as small, focused scripts. |
| Profiling scripts (`cdp-*.mjs`, `profile.mjs`, `cdp-village-worker-profile`) | ⛔ | Tied to the game's WebGL scene + debug overlay. |
| Asset scripts (`extract-village-props`, `convert-staging-audio`, `simulate-run-gold`) | ⛔ | Game content/economy tooling. |
| `@vibegameengine/platform`, `@vibegameengine/ui-scaler` | ⛔ | Platform SDK + viewport scaler. Plug platform init in as a `prepareStep`. |
| `howler` audio runtime | ⛔ | Runtime playback, not build pipeline. The **build-time** MP3 optimizer *is* included. |
| `zustand` | ⛔ | State management is an app choice; the kit stays unopinionated. `react-router-dom` IS included — the DEV lab routes need it. |
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
