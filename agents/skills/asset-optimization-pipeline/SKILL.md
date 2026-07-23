---
name: asset-optimization-pipeline
description: >-
  How build-time asset optimization works in this project and how to extend it.
  Every asset (image, audio, 3D model) is shrunk at build time by a dedicated
  Vite plugin in `vite/`, and every asset reachable from the entry graph is
  auto-collected into `virtual:bootstrap-assets` and preloaded by the bootstrap
  gate — no hand-written manifest. Enforces the shared plugin shape (resolveId
  tag → load repack → emit/serve, per-import `?…` query opt-out/tuning,
  closeBundle savings report) and the registry wiring (ASSET_EXTENSIONS + kind).
  MANDATORY before: adding/importing a `.glb`/`.gltf`/image/audio asset, adding a
  new asset TYPE, changing texture/audio/image compression, touching the
  preloader weighting, or writing a new `vite/*OptimizerPlugin.ts`. Trigger on:
  "optimize assets", "compress texture/model/audio", "GLB import", "glTF",
  "gltf-transform", "reduce bundle/asset size", "preloader", "loading bar",
  "virtual:bootstrap-assets", "why is my asset not preloaded", "add asset type",
  "assetsInclude", "asset pipeline", "?glb-optimize", "?audio-optimize",
  "?texture=", "?meshopt", "?albedo", "mesh/geometry compression", "meshopt",
  "draco", "quantize", "shrink a model", "character model too big", "painted /
  unlit / flat model look".
---

# Asset optimization pipeline

Assets in this project are **optimized at build time by dedicated Vite plugins**,
not at runtime and not by hand. Three optimizers live in `vite/` and are wired in
[`vite.config.ts`](../../../vite.config.ts):

| Asset | Plugin | Default action |
|---|---|---|
| Images | `ViteImageOptimizer` + `imagetools` | png/jpeg/webp q82, avif q60; resize via `imagetools` query |
| Audio (`src/**/assets/audio/*.mp3`) | `vite/audioAssetOptimizerPlugin.ts` | re-encode, bitrate by duration, clip-safe normalize |
| Models (`src/**/*.glb`/`.gltf`) | `vite/glbAssetOptimizerPlugin.ts` | dedup+flatten+prune, textures → 2048 WebP, repack to one `.glb` |

Separately, `vite/bootstrapAssetRegistryPlugin.ts` walks the static import graph
from `/src/main.tsx` and exposes **every reachable asset** through
`virtual:bootstrap-assets`, which the bootstrap gate preloads before the first
frame. Optimization (shrinking bytes) and the registry (preloading them) are two
independent concerns — a new asset type must be added to **both**.

## Import-boundary gate

The registry follows source-level static imports and re-exports; it does not
know which barrel export the runtime actually consumes. Therefore import every
**asset-bearing visual module** directly from its owning file: effects, render
entities, and materials that import images, audio, models, or shaders. Pure
code-only helpers and types may use a barrel. Never put a DEV/lab/reference
screen and a production visual module in the same barrel: it pulls the lab's
assets into the production registry and `dist`.

## The shared optimizer-plugin shape

All three optimizers follow the same contract. When you add or modify one, match
it (canonical reference: `audioAssetOptimizerPlugin.ts` and
`glbAssetOptimizerPlugin.ts`):

1. `enforce: 'pre'`, capture `config` in `configResolved`.
2. **`resolveId(source, importer)`** — intercept every project-owned import of
   your extension (resolve it, gate to `src/…` under `config.root`), and return a
   tagged id `"<absPath>?<my-module-query>&<carried source query>"`. Tag with a
   unique query key so `load` recognizes it and re-entrant resolves don't loop.
3. **`load(id)`** — if it's your tagged id, produce the optimized bytes (cache by
   id), then:
   - `serve`: register the bytes behind a `/@my-optimizer/<key>` middleware URL
     and return `export default "<url>"`.
   - `build`: `this.emitFile({ type:'asset', source, name })` and return
     `export default import.meta.ROLLUP_FILE_URL_<id>;`.
4. **`closeBundle()`** — log a per-file `input -> output` report and a total
   "N optimized, X saved" line (prefix `[audio]` / `[glb]`).
5. Cache optimization promises by id; **keep the source query in the id** so
   distinct per-import options map to distinct cache entries and served URLs.

### Per-import query convention (local tuning / opt-out)

Options are passed as query params on the import specifier — the same convention
across plugins. Each optimizer declares an opt-out and the audio/GLB opt-out
forms are declared as ambient modules in
[`src/vite-env.d.ts`](../../../src/vite-env.d.ts) so TS accepts them.

```ts
// audio
import track from './music.mp3?audio-optimize=off'      // keep original

// GLB — glbAssetOptimizerPlugin
import model  from './hero.glb'                          // default: 2048 WebP + cleanup
import ui     from './icon.glb?texture=512'              // cap textures at 512
import flat   from './logo.glb?texture-format=keep'      // resize only, keep source format
import raw    from './exact.glb?glb-optimize=off'        // untouched bytes
import lazy   from './big.glb?bootstrap=deferred'        // skip the blocking preloader
import char   from './npc.glb?texture=1024&albedo&meshopt' // stacked: 1024 albedo-only + geometry compression
```

GLB query params: `texture=<px>` (default 2048), `texture-format=keep|webp|jpeg|png|avif`
(default webp), `texture-quality=<1-100>` (default 80), `albedo` (keep only the
base-color map — drop normal/MR/emissive/AO), `meshopt` (compress geometry &
animation — see below), `glb-optimize=off`. Flags stack with `&`.

When you add a NEW option form that appears in an import specifier, add a matching
`declare module '*.glb?<form>'` to `vite-env.d.ts` (mirrors how
`*.mp3?audio-optimize=off` is declared) — TS wildcards allow only one `*`, so
each concrete option-bearing form is declared explicitly as it is first used.

## Registry / preloader wiring (do this too)

For an asset to be **preloaded** (and weight the progress bar), its extension
must be known to the registry:

- Add the extension to `ASSET_EXTENSIONS` in `bootstrapAssetRegistryPlugin.ts`.
- Give it a `kind` in `getAssetKind()` and extend the `BootstrapAssetKind` union
  there **and** the `kind` union in `virtual:bootstrap-assets` typing in
  `src/vite-env.d.ts`. Current kinds: `audio | font | image | model | other`.
- `preloadBootstrapAssets.ts` fetches non-image assets as bytes (cache-warm) and
  decodes images. Models fall in the byte-fetch branch — that warms the HTTP
  cache so drei's `useGLTF` parses from cache on first use. It does **not** parse
  the GLB during preload (no `THREE.LoadingManager`/`useProgress` bridge exists).
- Assets are **blocking** by default; `?bootstrap=deferred` keeps one out.
  Weighting is byte-based (`getBootstrapAssetWeight`), so the bar tracks size not
  file count.

## GLB specifics (glbAssetOptimizerPlugin)

- Built on `@gltf-transform/core` + `/functions` + `/extensions`; texture
  re-encode uses **`sharp`** (already a dep). Pipeline: `dedup → flatten → prune
  → textureCompress(webp, resize 2048, quality 80)`, with a second
  `textureCompress` pass that resizes **normal maps without changing format**
  (re-encoding tangent-space data as lossy corrupts lighting).
- Output is always a single self-contained `.glb`; `.gltf` inputs (external
  `.bin`/textures) are read from disk and repacked into one binary.
- Textures ship as **`EXT_texture_webp`** — three.js `GLTFLoader` supports this
  natively in browsers, no loader config needed.
- Two texture passes exist because normal maps must **not** be lossy-recoded.
  Every other slot goes to WebP; `normalTexture` is only resized (format kept).

### Mesh / geometry compression — `?meshopt`

By default the plugin only cleans + shrinks **textures**; geometry is untouched.
For a model whose bulk is mesh/skeleton/animation buffers (skinned characters,
high-poly props), add `?meshopt`:

- Runs `meshopt({ encoder: MeshoptEncoder, level: 'high' })` **last** in the
  pipeline (`meshoptimizer` is a dev dep). It quantizes vertex attributes
  (positions→16-bit, normals→octahedral, etc.) then Meshopt-encodes the buffers,
  writing **`EXT_meshopt_compression`**. The IO needs the encoder wired for
  writing: `io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder })` after
  `await MeshoptEncoder.ready`.
- **Runtime needs nothing.** drei's `useGLTF` sets `MeshoptDecoder` automatically
  (its `useMeshopt` arg defaults to true → ~30 KB wasm), so plain `useGLTF(url)`
  decodes it. This is why it's now enabled where earlier notes said "wire the
  decoder yourself" — drei already does.
- Lossy (quantization) but visually lossless at `level:'high'` for characters;
  **always re-verify skinning + animation** in a headed shot after enabling.
- Real numbers (tany-3, a Mixamo-rigged character): `?texture=1024&albedo` alone
  → 2.34 MB; adding `&meshopt` → **0.72 MB** (−69%), gzip 1.32 MB → 0.59 MB.
  Meshopt is the biggest lever whenever geometry, not textures, dominates a model.
- Draco (`draco()`) exists too but is not wired: ~200 KB decoder, slower, only a
  marginal ratio win over Meshopt here. Prefer Meshopt.

### Albedo-only + "painted" look — `?albedo`

`?albedo` runs a transform that detaches every non-base-color slot
(`setNormalTexture(null)`, MR, emissive, occlusion) before `prune()` drops the
orphaned textures — the shipped GLB then carries only the base-color map. Pair it
with a **runtime unlit material** for a flat "hand-drawn" look: in the entity,
traverse the loaded scene and swap each `MeshStandardMaterial` for a
`MeshBasicMaterial` that reuses `.map`/`.color` (`toneMapped:false`). Base-color
is all an unlit material reads, so the other maps are pure dead weight — hence
dropping them at build. See `features/character/entities/Tany.tsx`.

## Gotchas learned (do not re-discover these)

- **`prune()` folds solid-color textures into `baseColorFactor` and deletes the
  texture** — this is correct (a legit win), not a bug. If a test/model seems to
  "lose" its texture, check whether it was a uniform color. Verify with a
  non-uniform (gradient) texture.
- **Opt-out must be handled by the plugin itself**, not by returning `null` from
  `resolveId`. Rolldown (Vite 8) cannot load a `.glb` specifier that still
  carries a query (`UNLOADABLE_DEPENDENCY … test.glb?glb-optimize=off`), so the
  plugin intercepts even `?glb-optimize=off` and emits the untouched bytes.
- `.glb` IS in Vite's default asset types, but the **query suffix** is what
  breaks native handling — hence the always-intercept rule above.
- **A `.glb` still gzips well** even after WebP textures — the geometry buffers
  are compressible (tany-3: 2.34 MB → 1.32 MB gzip). Make sure the static host
  serves `.glb` with gzip/brotli; many don't by default. `?meshopt` shrinks the
  raw bytes so this matters less.
- A **blocking** model dominates the preloader bar (byte-weighted), so it gates
  first paint. Cut it with `?meshopt`, or move it off the critical path with
  `?bootstrap=deferred` if a late pop-in is acceptable.
- **Overwriting a source asset in place does NOT refresh in a running dev server** —
  the optimizer caches its result by import URL (see the "Cache optimization promises
  by id" rule), not by file content, so the browser keeps serving the STALE optimized
  bytes. After you rewrite a `.glb`/image/audio the app imports, restart dev **and**
  `rm -rf node_modules/.vite` to clear the cache; otherwise a fixed asset still shows
  the old (or a mid-experiment, broken/invisible) version. Symptom that wastes hours:
  "I re-exported the model but the app looks unchanged / the mesh went invisible."

## Verify a change end-to-end

The app has no `.glb` in its graph, so build the plugin in isolation. In a
scratch dir: generate a fixture GLB with a >2048 **gradient** texture via
`@gltf-transform/core` + `sharp`; write a tiny entry that imports it; run
`vite build --config <cfg>` where the config registers `glbAssetOptimizerPlugin`
(+ `bootstrapAssetRegistryPlugin`) with `root` set to the scratch dir and the
fixture under `<root>/src/…` (the plugin gates on `src/`). Then read the emitted
`dist/assets/*.glb` back with `NodeIO().registerExtensions(ALL_EXTENSIONS)` and
assert texture dims (2048), format (webp), and that the texture still exists.
Test `?texture=512` and `?glb-optimize=off` as separate imports and confirm 512
WebP vs kept original. (Symlink the repo `node_modules` into the scratch dir so
deps resolve.)

For `?meshopt` / `?albedo` on a real skinned model, a scratch fixture is not
enough — verify in the running app: re-read the emitted GLB
(`listAnimations()`/`listSkins()` still present, `?albedo` → one texture) **and**
take a headed screenshot to confirm the mesh, skinning and animation survived the
lossy quantization (no exploded verts, clip still plays).
