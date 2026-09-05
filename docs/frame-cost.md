# Frame cost in the arena — what actually costs, measured

> Companion: **[frame-cost-lessons.md](./frame-cost-lessons.md)** — the falsified
> hypotheses, the instrument traps, and the process mistakes. More hypotheses died
> in this work than survived, and that file is where they are written down. Read it
> before profiling anything here.

The arena had "hellishly unstable fps". This is what it turned out to be, what it
did not turn out to be, and the falsified guesses, so nobody re-derives them.

The instrument is `scripts/arena-fps-probe.mjs` plus the DEV seam it reads,
`src/shared/lib/graphics/FrameProbe.tsx`. `scripts/fps-graph.mjs` draws a report;
`scripts/shot-arena-corpses.mjs` photographs the thing a frame-time graph cannot
see; `scripts/fps-verdict.mjs` judges a set of runs against the bar. Reports land
in the git-ignored `wip/fps/<tag>/`.

Judging is a SCRIPT and not a paragraph on purpose. This bar was agreed in advance
and then reported against by hand, and the hand-report quoted the best of four
runs on the one criterion it came closest to, while never mentioning the second
criterion at all — not dishonestly, just by writing down the number that was in
front of it. A bar only its author can evaluate is not a bar:

    node scripts/fps-verdict.mjs verify1 verify2 verify3 --exclude=A1 --exclude=A2

The `--exclude` arms are the blood A/B's deliberately-degraded control (they run
the 16 MB per-frame upload this work removed), so judging shipping behaviour
against them means nothing. The tool prints the verdict with AND without them,
and names every excluded segment with its own numbers, because excluding them
quietly is how an exclusion becomes an argument.

Display is **120 Hz**, so the budget is **8.33 ms**. Every number below is headed,
on the real GPU (AGENTS.md rule 1).

## THE cause, found last and worth all the others put together

The ~25 Hz presentation publish was re-rendering the entire arena scene.

`ArenaCombatSimulation` publishes the solved state about twenty-five times a
second. That state was held in a `useState` at the TOP of
`QuakeCombatArenaScene` — so every publish re-rendered the sky, the fog, four
lights, the VFX light pool, the shader warmup, the image-based light, both shadow
groups, the cathedral geometry, the heightfield loader, and the `<Physics>`
provider. **None of those read the state.** They re-rendered because of where a
`useState` happened to live.

The state now lives in `features/arena-combat/components/CombatPresentationLayer.tsx`,
below `<Physics>`, in the only component that consumes it. A publish re-renders
four things that genuinely change: bodies, projectiles, decals, droplets.

Measured as PRESENTATION INTERVALS (rAF, the external recorder — see the
instrument note below), whole waves played out with kills:

| wave | before | after (two runs) |
|---|---|---|
| W1 | mean 9.49 ms, p99 16.8, **88.2%** clean frames | mean 8.48, **p99 8.5**, **99.9% / 99.9%** |
| W2 | mean 9.58 ms, p99 16.8, **86.1%** | mean 8.39, **p99 8.5**, **99.6% / 99.6%** |
| W3 | mean 8.74 ms, p99 16.7, **95.4%** | mean 8.38, **p99 8.5**, **99.6% / 98.9%** |

**p99 equals p50.** That is what "flat as a thread" means as a number, and it is
the shape in `wip/fps/thread-after.png` against `thread-before.png`.

Dropped frames went 11.8% / 13.9% / 4.6% → 0.1% / 0.4% / 0.4–1.1%.

The lesson generalizes, and it is the one to carry: **a `useState` re-renders
everything below it, so where the state lives is a frame-cost decision.** A tick
publishing into a component that sits above the world costs the whole world,
every tick, regardless of what reads it.

## Why this took so long to find, and the instrument lesson underneath it

It was invisible to the instrument used for most of this work. `FrameProbe`
samples delta end-of-render to end-of-render; under vsync that equals
`period + (work[i] − work[i−1])` — a FIRST DIFFERENCE of the work signal, not the
interval a player waits. Its signature is unmistakable once looked for: the empty
arena reports a mean of exactly 8.33 ms with lag-1 autocorrelation −0.49, 29% of
frames come in under 7.33 ms and some at 2.5 ms (impossible as a 120 Hz
presentation interval), and the distribution is a smooth unimodal blob from 2.5
to 15 ms rather than spiky at multiples of the refresh.

So every "p99/mean = 1.6" and "56% of frames over budget" from that instrument
was largely its own arithmetic, and a regression of delta on draw calls,
triangles, GC and GPU time returns R² ≈ 0.12 because you cannot regress a first
difference against levels.

**A rAF-to-rAF interval IS a presentation interval.** `scripts/arena-frames-external.mjs`
records one from an `addInitScript`, and it was cross-checked once against the
browser compositor via CDP screencast timestamps — they agreed (9.81 vs 10.46,
10.60 vs 10.66). Use `--light` after that: the screencast costs about 2 ms a
frame and otherwise measures itself.

## The other causes, in the order they cost

### 1. The blood floor re-uploaded 16 MB per frame — kit lesson

`bloodFloorAccumulation.ts` kept a 2048×2048 canvas of baked blood and marked it
`texture.needsUpdate = true` whenever anything changed. That is a **full ~16 MB
re-upload**, and during a fight something bakes on nearly every frame.

Fixed by uploading only the rectangle that changed, via
`renderer.copyTextureToTexture(scratchTexture, texture, region, position)`.

Measured, same wave and weapon, ~10 kills, twice:

| upload mode | mean | p95 | p99 | frames > 16.7 ms |
|---|---|---|---|---|
| full 2048² (old) | 13.86 / 10.50 | 50.4 / 14.4 | 56.5 / 46.8 | 11.7% / 3.3% |
| dirty rectangle | 9.31 / 9.32 | 13.2 / 13.1 | 15.8 / 15.6 | 0.8% / 0.6% |
| no upload at all | 9.48 / 9.28 | 13.0 / 13.3 | 15.4 / 15.5 | 0.7% / 0.9% |

The new path sits **on** the no-upload control, which is the only statement worth
making about it. `BloodFloorMode` (`'full' | 'on' | 'no-upload' | 'off'`) keeps the
old path reachable **on purpose**: a fix whose before-state exists nowhere is a fix
nobody can check, and the first version of this work made exactly that mistake —
the old code was rewritten in place and the headline number became unreproducible.

Two traps inside this, both hit:

- `copyTextureToTexture` takes the cheap CPU `texSubImage2D` branch only while
  `properties.has(srcTexture)` is false. Hand the scratch texture to a material,
  or call `renderer.initTexture()` on it, and three silently switches to a
  framebuffer **blit from a GPU copy that was never uploaded** — black rectangles
  stamped into the floor, no error, no warning.
- A **single union bbox cannot express two disjoint regions.** The stamps cluster
  where bodies fell; the fade thins a tile somewhere else. Unioned, the box spans
  both and trips the "bigger than half the canvas, just do a full upload" guard —
  so the tiled fade's whole purpose was defeated on every frame the fade ran.
  `stampRect` and `fadeRect` are now uploaded separately.

**Still open:** the destination texture keeps `generateMipmaps = true`, so every
partial copy rebuilds the full 11-level 2048² chain (`WebGLRenderer`:
`if (dstLevel === 0 && dstTexture.generateMipmaps) generateMipmap()`). Turning it
off needs `minFilter` changed too or the texture becomes incomplete, and that
trades a GPU cost for aliasing on a floor at 3 cm/texel. Not measured either way —
a vsync-locked run cannot see a sub-8 ms GPU cost.

### 2. Droplets were published as React state every frame — kit lesson

`useArenaBlood` called `setInFlight(...)` inside `useFrame`, so the **entire arena
scene component re-rendered 120 times a second** — lights, physics world, enemy
bodies, projectiles, weapon view model — to hand `BloodDropletField` a list it
reads inside its own `useFrame` anyway. It even fired with zero droplets in the
air, because the empty case built a fresh `[]` each frame.

`BloodDropletField` now takes a **ref**. Nothing it renders depends on the
droplets at React level: the instanced mesh is allocated once at capacity and only
`count` moves.

This is what took the non-firing waves from 8.47–8.93 ms to a flat 8.33 ms.

The general rule: **if a component consumes a value only inside `useFrame`, pass a
ref, not state.** Publishing it as state buys nothing and costs a reconciliation
of everything above it.

### 3. A death unmounted the body and built a new one — project lesson

`EnemyPrefabBodies` rendered the living under `key={enemy.id}` and the fallen under
`key={`${enemy.id}-remains`}`. To React that is not a body dying, it is one leaving
and a different one arriving — a fresh skinned-mesh clone, a fresh skeleton and a
fresh set of ragdoll colliders, in the frame of the kill. A second, independent
trigger sat next to it: the living branch wrapped `<Imp>` in a fragment and the
dead branch did not, which is also a remount.

This was found by cross-tabulating columns already in the report and never read:
**frames that raise the renderer's texture count averaged 27–37 ms against 8.3 ms
elsewhere**, carried about eighteen new geometries that unwound half a second
later, and arrived at the kill rate. Three to five dropped frames on every kill.

It was never the intent, either — the file's own note says `ragdoll` is mounted on
the LIVING body so "a death can land on the tick it happened instead of swapping in
a second, matching corpse". The key change was quietly doing that swap.

One element per body now, one key, phase as props. Result: combat max frame
41.0 → 27.7 ms, frames over 16.7 ms 19 → 4 per 1662, per-fight texture creation
+9 → +3.

## Still open, and the biggest one left: the wave-spawn frame

Measured only once the probe was made to record the spawn instead of sleeping
2.5 s past it (`recordWave` in `scripts/arena-fps-probe.mjs`; `wip/fps/wavefull/`):

| wave | frames / duration | mean | p99 | max | frames > 16.7 ms |
|---|---|---|---|---|---|
| 1 | 1574 / 13.4 s | 8.44 ms | 13.9 | **84.1** | 4 |
| 2 | 3280 / 28.4 s | 8.59 ms | 15.6 | **133.4** | 15 |
| 3 | 7111 / 60.9 s | 8.51 ms | 14.7 | **134.0** | 24 |

The largest frame of every wave is frame 1–3 — the frame the wave mounts.

**A wrong attribution, recorded because it was published before it was checked.**
That frame also raises the renderer's texture count by +6 / +10 / +10, and this
was written up as first-use texture upload. It is not. three lazily builds one
`boneTexture` per `Skeleton` on the first frame a skinned mesh is drawn
(`WebGLRenderer`: `if (skeleton.boneTexture === null) skeleton.computeBoneTexture()`),
and `mob/entities/Mob/useMobRig.ts` clones a **new Skeleton per body** — so the
delta is exactly the count of GLB-rigged bodies in the batch: 6 imps in wave 1,
5+5 in wave 2, 6+4 in wave 3. Against the report: +6, +10, +10. Three for three.
The archetypes' actual maps were already resident: the warmup fight draws all four
archetypes and ends at 78 textures, and wave 1 — imps only, already drawn
thousands of frames — still allocates six. **A rising counter is not a cause.**

What the frame really is: one React commit mounting 6–12 rigged bodies —
`cloneSkinned` deep-cloning a skinned graph per body, ~10 `AnimationClip` clones
and material clones each, plus Rapier ragdoll construction — and on a wave change
*also* unmounting the previous wave's bodies, because `wave-N` is a full reset
(below). The report's own `longTasks` bound the JS share at 54 / 89 / 88 ms
against 84 / 133 / 134 ms deltas.

### What was done about it, and what it did not do

**Staggered mount** (`EnemyPrefabBodies.tsx`): at most two NEW rigged bodies are
admitted per frame, from `useFrame`. Procedural archetypes (brute, skitter) draw
from module singletons and cost nothing, so they are not charged against the
budget — charging them let a frame spend its whole allowance on two skitters and
delay two cultists to the next one.

**Memoizations** — none of which change a lifecycle, and none of which share a
`Skeleton` or an `AnimationMixer` between bodies (never do that):

- `mob/systems/boneLayers.ts` caches each layered `AnimationClip` per
  (source, layer, name, bone filter). `source.clone()` deep-copies every track's
  typed arrays and then throws half away — about 730 KB and ~330 track objects per
  imp, previously repeated for every body. `AnimationMixer.clipAction` caches by
  (clip, root), so one clip legitimately drives many bodies.
- `ragdoll/systems/mixamoRig.ts` caches the vertex cloud per geometry, keyed by
  bone name so a fresh skeleton can be looked up against it: ~21k `Vector3`
  allocations per mount, gone. The same pass also used `bones.indexOf(bone)` —
  a linear scan over 47 bones, inside the per-vertex loop — when the skin index it
  already had *is* the bone index.
- The same file no longer walks the mesh `|| import.meta.env.DEV`. Every mob was
  paying a full vertex walk on mount whether or not anything read the answer, and
  the DEV build is the build being profiled.
- `useMobRig.ts` lifts the brightened-material cache to module scope. It claimed
  to clone "per source material rather than per body" while living inside a
  per-body `useMemo`, so ten cultists meant ten copies of one material.

Measured, whole-wave with the spawn inside the window:

| admit budget | peak W1/W2/W3 | total over budget W1/W2/W3 |
|---|---|---|
| none — one frame | 84 / 133 / 134 ms | 84 / 147 / 134 ms |
| 2, cost-blind | 31 / 36 / 29 | 110 / 143 / 132 |
| 1, cost-aware | 20 / 26 / 20 | 108 / **267** / 174 |
| 2, cost-aware (taken) | 29 / 33 / 35 | 76 / 155 / 148 |

**Read the total column.** Staggering does not make the work cheaper — it decides
how many frames it lands on. The first version of it turned a 134 ms freeze into
165 ms of stutter and was one report away from being called a fix. What the change
actually buys is a ~4× lower peak for a total that is a wash against the original,
inside this bench's run-to-run drift (measured at 8.43–8.80 ms mean on segments
containing no spawn at all — always check that control before believing a delta).

**Still open — the real fix.** What remains is genuinely per-body: the skinned
clone, the `Skeleton` and its bone texture, the mixer, and the ragdoll's rigid
bodies. Removing those needs a slot pool — N never-unmounted bodies per archetype,
driven by prop. That is a lifecycle change, not a memoization, and the hazards are
specific: a recycled slot carries the previous body's world-space ragdoll `center`
and `bind` (`Mob.tsx` guards first placement with `scene.userData.placed` because
a tie captured in the wrong place "absorbs the whole distance as a lever arm");
`playing.current` still names the last body's take, so the recycled one's first
take never starts and it appears frozen in the pose the last one died in; and
`selfActive` keeps a corpse limp. Any cached ragdoll measurement must be taken
*through* `poseToBind`'s scale normalization and keyed on the APPLIED scale, or it
reproduces the `?meshopt` disaster in AGENTS.md rule 5 exactly.

Two more, both from the same reports and both unfixed:

- **A per-mount leak — FIXED.** Textures went 72 → 200 across one probe run and
  never came down, and a segment reporting `enemiesAlive: 0` was still holding 118
  of them. It is not the albedo maps, which `useGLTF` caches and shares: it is the
  SKELETON. three lazily builds one `boneTexture` per `Skeleton` on the first
  frame a skinned mesh is drawn, `cloneSkinned` makes a new Skeleton per body, and
  nothing in the mob path called `dispose()` on anything — so every wave
  transition leaked one texture per body for as long as the page stayed open.
  `useMobRig` now disposes the skeleton and uncaches the mixer root on unmount.
  What it deliberately does NOT dispose is the materials and geometry: those are
  shared across every body of a kind (the `brightened` cache is module-scope and
  `cloneSkinned` shares geometry), so releasing one body's would pull the texture
  out from under its living siblings. A pooled resource is freed by whoever owns
  it, and a body owns its skeleton and its mixer — nothing else.
- **Geometry churn during the fight**: create/dispose events fire 27 / 204 / 284
  times inside a single wave segment, landing on 10–17 ms frames. Spread over
  thousands of frames this costs more total frame time than the one spawn spike.

## A trap in the DEV seam that invalidated a whole round of measurement

`wave-N` through `__arenaCombatDebug` is **not** "send more enemies". It reaches
`advanceArenaCombat`, which answers it with `createArenaCombatState(wave)` — kills
to 0, every corpse and ragdoll gone, the blood floor's accumulation orphaned, the
player teleported to spawn, the weapon re-created.

The probe used to re-fire it once a second to keep a fight going. That meant every
"fight" measurement was capped at three to five seconds of corpse and blood depth —
the exact accumulation the complaint is about — and every `kills` figure taken
across it was kills *since the last reset*. Use `recordWave`, which never re-arms,
for anything that is a claim about a wave.

## What it was NOT — falsified, with the number

- **Not GPU-bound.** Quartering the shaded pixels (dpr 1.0 → 0.5) moved the mean
  from 9.65 to 9.42 ms, while a *repeat* at full resolution gave 9.22 — faster than
  the half-res run. Post (N8AO + Bloom + SMAA), shadows and overdraw are innocent.
  Caveat recorded honestly: that bisection was taken **vsync-locked**, where the
  mean cannot move until a deadline is missed, so it is weaker evidence than it
  looks. `--unlocked` is the mode that would settle it and has not been re-run.
- **Not shader compilation.** `programs +0` in every steady-state segment; the
  existing `combatVfxWarmup` is doing its job.
- **Not the draw-call count, primarily.** Combat runs 240–320 draw calls against
  the project's ~30 budget and still holds 118 fps. Worth fixing (each procedural
  prefab is ~30 separate meshes; the brute's eyes are `MeshPhysicalMaterial`), but
  it is not what the player was feeling.

## The verdict on this pass: FAIL against its own target

An audit fixed the acceptance bar BEFORE the closing report was written:

> Three consecutive probe runs, worst counted not best: every recorded segment
> including the whole-wave ones has 0 frames over 16.7 ms and at most 1.0%
> at/over 12.5 ms, and pooled max ≤ 16.7 ms — with the wave spawn inside the
> recorded window and no mid-wave resets.

Delivered: W1 3 of 1592 over 16.7 ms (max 28.9), W2 8 of 3108 (32.7), W3 9 of
7204 (34.8). Two independent reviewers recomputed from the raw frame arrays and
both returned **FAIL**. Recorded here rather than softened, because the whole
point of fixing a bar in advance is that it cannot be renegotiated afterwards.

Three things the reviewers found that matter more than the verdict:

- **The 12.5 ms clause was never addressed.** The waves run 2.32% / 1.32% / 1.99%
  against a 1.0% ceiling. The closing report quoted only the criterion it came
  closest on, which understates the gap. If a report names one of two clauses,
  assume the other one failed.
- **W3 never completes.** Every run ends `timeout` with 1 of 20 enemies alive, so
  its last stretch is a thinning arena — which deflates exactly the tail statistic
  being reported. `ended` and `seconds` are in the report for this reason; read
  them before comparing a W3 row to anything.
- **"Segments with no wave spawn" is not a drift control.** They always run LAST,
  after three minutes of fighting, so position-in-run and machine state are
  confounded with the treatment. The only honest shape is the same segment
  recorded twice, once first and once last.

**Is the bar reachable?** Not on this bench as worded. `FrameProbe` returns early
unless `import.meta.env.DEV`, so the probe *cannot exist in a production build* —
every number in `wip/fps/` is off the dev server, with unminified React and the
HMR client attached. Asking for zero missed vsync deadlines across six minutes of
that is not a statement about the shipped game. Either restate the bar as a DEV
bar, or build a probe that survives `import.meta.env.PROD`. That is a defect in
the target, not an excuse for the miss — the miss is real either way.

## Instrument lessons — kit

- **r3f-perf fights you for `gl.info`.** `<Perf>` sets `autoReset = false` and
  resets from its own `addEffect`. With two owners the loser reads zero, and the
  loser was visible in the captures the whole time: the panel showing `0 calls /
  0 Triangles` beside a populated `47 Geometries`. The probe now presses "P" to
  unmount it before recording.
- **Sample in `addAfterEffect`, and time the interval that ENDS there.** Timing in
  `addEffect` and reading counts after the render pairs *the previous frame's
  duration* with *this frame's draw calls* — which inverts the one comparison the
  two columns exist to make.
- **"Frames over 8.33 ms" is not a metric.** Under a vsync lock the sample point
  wanders inside the frame; the empty arena scored 48.5% on it and the heaviest
  fight 57.6%. Count frames over 16.7 ms instead — that separated them 0 vs 132.
- **A profiling run needs a warmup segment.** Without one the first fight pays the
  whole run's one-time shader link and first-use texture uploads, and an A/B
  compares a treatment against the cost of going first. Two thirds of this task's
  original headline number was exactly that; the same measurement fell from
  3.64 ms to 1.10 ms in the run where the first segment happened not to link a
  program. Run A-B-C twice; the repeat is also the only noise floor you get.
- **Stamp every report with the commit and a dirty flag.** Reports here recorded
  only a free-text `--tag`, and the consequence was found by a reviewer, not by
  me: the probe was edited between the baseline run and the runs compared against
  it — provable from the artifacts, because the earlier reports lack the
  `ended`/`seconds` keys the later ones carry — and because the harness was
  untracked, the earlier version is unrecoverable. A before/after across an
  instrument change of unknown size is not a measurement. `codeState()` in the
  probe now records `commit` and `dirty`; a clean SHA on a dirty tree is a lie,
  which is why both are written.
- **`PerformanceObserver` long-task labels are attributed at delivery time**, not
  at entry time, so a segment label read inside the callback is the wrong one.
  Still unfixed here; `frames` rows carry no timestamps, so the long tasks in these
  reports cannot be re-attributed. Record per-frame timestamps if this matters.
