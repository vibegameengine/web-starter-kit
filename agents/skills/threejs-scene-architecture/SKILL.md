---
name: threejs-scene-architecture
description: >-
  Frame-cost architecture for Three.js / react-three-fiber scenes in this
  project: how the scene is rendered multiple times per frame (main + shadow +
  velocity passes), and the static/dynamic split that stops invariant work being
  recomputed every frame. Use when reasoning about fps/perf beyond draw calls,
  shadows, GI / indirect / bounce light, reflections, "why is the scene rendered
  several times", "why so many triangles", per-frame cost, or when adding moving
  objects (players, monsters, projectiles) to a mostly-static world. Enforces:
  tag world geometry static vs dynamic (shadowLayers.ts / <ShadowGroup>), never
  recompute a pass whose inputs did not change (throttle/cache shadows, bake
  static GI), compute only the cheap dynamic delta per frame, composite. Trigger
  on: "shadows every frame", "bake", "static/dynamic", "GI", "reflected light",
  "reflections", low fps that instancing did not fix. Pairs with
  threejs-instancing-materials (draw-call budget).
---

# Scene frame-cost architecture (static vs dynamic)

Instancing (see `threejs-instancing-materials`) controls **draw calls** — the
cost of *one* render of the scene. This skill controls the other axis: **how
many times, and how often, the scene (or a part of it) is rendered per frame.**

## What actually costs per frame

The scene is rendered **several times every frame**, and this is normal — every
engine does it:

- **Main color pass** — the visible image.
- **Shadow map pass** — the scene re-rendered from each shadow-casting light's
  point of view (depth only). Shadows do not exist without this pass.
- **Velocity pass** — if motion blur / TAA is on, the scene is re-rendered with
  velocity materials so post knows per-pixel motion.
- Post passes (N8AO, Bloom, SMAA…) are full-screen quads, cheap in geometry.

So the r3f-perf **triangle count is scene-tris × number-of-passes**. That number
looks big (15k for a trivial scene) but **triangles are not the bottleneck** —
GPUs eat millions. Do not optimize for triangle count. The real levers are
**draw calls** (CPU state changes) and the **number of full-scene passes**.

## The core principle

> Never recompute a pass whose inputs did not change. Cache/bake the expensive
> static part once, compute only the cheap dynamic delta per frame, composite.

The sun is fixed and world geometry never moves, so its shadows, its indirect
(bounce) light, and its reflections are **constant**. Recomputing them every
frame is pure waste. Only *moving* objects produce a per-frame delta.

## Step 1 — Classify every object static vs dynamic (do this early)

One classification feeds **all** frame-cost subsystems (shadows, GI,
reflections), so lay it down as soon as the scene exists — even before you build
those subsystems. In this project it lives in:

- `src/shared/lib/shadowLayers.ts` — `SHADOW_LAYER = { static: 1, dynamic: 2 }`,
  `tagShadowKind(object, kind)`. Uses three.js **layers** (layer 0 stays on
  everything, so tagging never changes the current render; it only labels
  casters so a shadow/GI/reflection camera can render one set at a time).
- `src/shared/lib/ShadowGroup.tsx` — JSX wrapper: `<ShadowGroup kind="static">…world…
  </ShadowGroup>`, `<ShadowGroup kind="dynamic">…units…</ShadowGroup>`. For
  objects spawned imperatively (a monster on spawn), call `tagShadowKind(obj,
  'dynamic')`.

Rule: **static** = world geometry that never moves (buildings, terrain, ruins,
props). **dynamic** = anything that moves (players, monsters, projectiles,
doors). When unsure, static is the default for level geometry.

## Step 2 — Do not recompute shadows every frame

Shadows change slowly (fixed sun; objects move little between frames). Take
manual control instead of the default per-frame rebuild:

- `src/shared/lib/ShadowThrottle.tsx` — `gl.shadowMap.autoUpdate = false`, then flag
  `needsUpdate` every N frames. `<ShadowThrottle every={2} />` halves the shadow
  pass cost invisibly. `every={Infinity}` ≈ "bake once" for fully static scenes.
- **Throttling is the always-correct first win.** Do it before anything fancier.

## Step 3 — The real static/dynamic shadow split (only when needed)

When there are many moving units and throttling is not enough, implement the
engine-standard **cached shadow map** (Unreal) / shadowmask (Unity):

1. Render `SHADOW_LAYER.static` casters into the shadow depth map **once**, copy
   to a cached depth texture.
2. Each frame: reset the working depth to the cache, render **only**
   `SHADOW_LAYER.dynamic` casters on top (depth test keeps the nearest).
3. Feed the combined map to the light as its shadow map.

This is custom shadow-map work (RTT + depth copy + a depth material for dynamics)
— **not five lines.** Build it when profiling proves throttling is insufficient,
not preemptively on an empty scene.

## Step 4 — GI, reflections: same pattern

The static/dynamic split generalizes to every "expensive but slowly-changing"
subsystem:

- **GI / indirect (bounce) light** — bake the static world's indirect light
  **once** into lightmaps / irradiance probes (it's constant). Dynamic objects
  **sample** that baked irradiance via light probes, plus an optional realtime
  add (e.g. SSGI for contact bounce). Composite baked + dynamic. (Unity: baked
  lightmaps + Light Probes. Unreal: lightmaps + Lumen for dynamics.)
- **Reflections** — bake a static reflection cubemap once; add SSR only for
  dynamic surfaces.

When GI/reflections get built, lift the classification out of `shadowLayers.ts`
into a shared `sceneLayers.ts` (still `static` / `dynamic`) that shadows, GI and
reflections all read. Do not build that shared abstraction before a second
consumer exists — YAGNI.

## Sequencing (avoid premature engineering)

1. Lay the static/dynamic **convention** as soon as the scene exists (cheap,
   feeds everything).
2. **Throttle** shadows (`ShadowThrottle`) — instant win, no new systems.
3. Build the **cached-shadow split**, **baked GI**, or **baked reflections**
   only when there is real dynamic content AND the profiler shows the pass is a
   bottleneck. Building these against an empty scene is the same premature
   optimization this skill warns against — one level up.
