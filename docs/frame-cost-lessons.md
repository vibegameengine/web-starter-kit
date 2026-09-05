# Chasing an unstable frame rate: everything this cost to learn

A session spent taking `/labs/quake-combat-arena` from "hellishly unstable fps" to
a flat 120. The fixes are in `docs/frame-cost.md`. **This file is the other half:
what was believed and turned out false, and what the instruments did to the
answer.** Six critics and a manager each overturned something; more hypotheses
died than survived. That ratio is the lesson, not a footnote to it.

Read this before profiling anything in this repo. It will save the day it cost.

---

## I. The single biggest lesson: measure the interval the player waits

**The instrument was measuring the wrong quantity for most of the session, and it
invented a defect that was not there.**

`FrameProbe` sampled frame time in r3f's `addAfterEffect` — end of one render to
end of the next. Under vsync that equals

```
delta[i] = refreshPeriod + (work[i] − work[i−1])
```

a **first difference** of the work signal, not the interval anyone waits. Its
signature, once you know to look:

- the EMPTY arena reported a mean of **exactly 8.33 ms** with lag-1
  autocorrelation **−0.49** — a long frame always repaid by a short one;
- **29% of frames came in under 7.33 ms**, some at 2.5 ms, which is impossible as
  a presentation interval on a 120 Hz display;
- the distribution was a smooth unimodal blob from 2.5 to 15 ms, where a real
  dropped-frame process is **spiky at multiples of the refresh**.

Everything derived from it was noise dressed as a finding: "p99/mean = 1.6",
"56% of frames over budget", a hunt for what made the graph a saw. A regression of
that delta on draw calls, triangles, GC and GPU time returns **R² ≈ 0.12** — you
cannot regress a first difference against levels.

**What to use instead.** A `requestAnimationFrame` interval IS a presentation
interval. `scripts/arena-frames-external.mjs` records one from
`page.addInitScript`, so it shares no code with the app and has no DEV branch of
its own. Cross-check it once against the browser compositor (CDP
`Page.screencastFrame` timestamps), then run `--light`: the screencast costs about
2 ms a frame and otherwise measures itself. Two honest headline numbers:

- **share of intervals that are a single refresh period** — the "thread";
- **the largest interval anywhere in the wave** — the hitch a player remembers.

**p99 is not enough.** After the last fix W1 reported `p99 = 8.5 ms` while
containing a **233 ms freeze**, reproduced in both runs at the same second. One
frame in 1600 does not move a 99th percentile. Always report the max, and always
look at the frames around it.

---

## II. Falsified hypotheses, each with the number that killed it

Written down because a recorded dead end is worth more than a recorded success:
the success gets re-derived from the code, the dead end gets retried by everyone.

| Believed | Killed by |
|---|---|
| **The spawn hitch is first-use texture upload** | three lazily builds one `boneTexture` per `Skeleton` on first draw, and `cloneSkinned` makes a new Skeleton per body — so `dTex` equals the count of GLB-rigged bodies in the batch, exactly: 6/10/10 against report +6/+10/+10. The archetypes' maps were already resident. **A rising counter is not a cause.** |
| **Capping at 120 fps will pace the renderer** | Added the cap (the app only had `0\|30\|45\|60`). Everything got worse: sd 1.62 → 2.26, p99/mean 1.539 → 1.644, share of frames near a refresh multiple 64% → 44%, frames under 7 ms 10% → 19.5%. `maxFps` in the vendored r3f fork throttles the render LOOP; it is not a presentation pacer, and with no headroom it fights vsync instead of riding it. |
| **108 MB/s of garbage is the cause** | GC-marked frames cost ~1.25 ms each and total **384 ms of 8468 ms** over budget — 4.5%. Removing all of it moves the mean by ~0.05 ms and p99 by nothing. |
| **The DEV rig telemetry is the allocator** | Gating off a per-frame per-body 49-node `scene.traverse`: 109.0 → **108.4** MB/s. Nothing. (Worth doing anyway — see IV.) |
| **The simulation's per-tick objects are the allocator** | Measured directly by driving `advanceArenaCombat` at 125 Hz: **0.3–0.4 MB/s**, i.e. 250× too small. |
| **The frame is GPU-bound** | Quartering the shaded pixels (dpr 1.0 → 0.5) moved the mean 9.65 → 9.42 while a *repeat* at full resolution gave 9.22. Later, directly: **GPU mean 0.88 ms, p50 0.45**, out of an 8.4 ms frame. |
| **Staggering the body mount fixes the spawn hitch** | It caps the PEAK and raises the TOTAL: 84/147/134 ms → 152/181/165 ms across more frames. A freeze became a stutter and was nearly reported as a fix. Read the total column, not just the peak. |
| **Staggering the teardown too, by symmetry** | W2 unchanged (6 intervals over 16.7 ms), W3 **12 → 20**. Holding dead bodies alive keeps their rigid bodies in the physics world; the cost is not removed, it is paid alongside the mounts it was meant to make room for. |
| **Draw calls are the problem** (240–320 against a ~30 budget) | Real but secondary: 25–29% of over-budget time, and the scene held 118 fps at 320 calls. Worth ~1.2 ms of mean and nothing on the spread. |

---

## III. What actually cost the frames

In the order they cost, all in `docs/frame-cost.md` with before/after numbers.

1. **A `useState` in the wrong place** — worth all the others put together. The
   fixed tick published its solved state ~25 times a second into state held at the
   TOP of the scene, so every publish re-rendered the sky, the lights, both shadow
   groups, the cathedral and the `<Physics>` provider. **None of them read it.**
   Moving that state down beside its four real consumers took the clean-frame
   share from 88/86/95% to **99.6–99.9%** and p99 from 16.8 ms to **8.5 ms**.
2. **A 2048×2048 texture re-uploaded whole (~16 MB) on any change** — replaced by
   a dirty-rectangle upload. p99 55.4 → 14.2 ms.
3. **Per-frame React publishing of data only a `useFrame` reads** — droplets moved
   to a ref.
4. **A React key change on death**, rebuilding each body's skinned mesh, skeleton
   and ragdoll on every kill.
5. **A wave mounting 6–12 rigged bodies in one commit** — 84/133/134 ms.
6. **Per-mount work every body of a kind could share** — ~730 KB of AnimationClip
   cloning and a 21k-vertex walk, per body.

**The generalization worth carrying out of this repo:** *where React state lives
is a frame-cost decision.* A tick publishing into a component above the world
costs the whole world, every tick, regardless of what reads it.

---

## IV. Instrument lessons (portable — these hold in any project)

- **A second profiler will fight you for the same counters.** r3f-perf sets
  `gl.info.autoReset = false` and resets from its own `addEffect`. With two owners
  the loser reads zero — visible for hours in the captures as a panel showing
  `0 calls` next to a populated `47 Geometries`. Unmount it before recording.
- **A profiling run needs a warmup segment.** Without one the first fight pays the
  whole run's one-time costs, and the A/B compares a treatment against the cost of
  going first. Two thirds of this session's first headline number was exactly
  that. It also cuts the other way: the 233 ms freeze only became visible when a
  harness *without* a warmup was used, because the probe's 2.5 s settle had been
  sleeping through it.
- **Run A‑B‑A, not A‑B.** The repeat is also the only noise floor you get. This
  bench's run-to-run drift on tail statistics is 25–30%, larger than most effects
  argued about.
- **"Segments with no X in them" is not a drift control** if they always run last.
  Position-in-run and machine state are confounded with the treatment. The only
  honest shape is the same segment recorded twice, first and last.
- **Stamp every report with the commit and a dirty flag.** Reports carrying only a
  free-text tag hid that the probe was edited mid-experiment — provable only
  because later reports had keys earlier ones lacked.
- **Don't edit the instrument or the code mid-set.** HMR applies a source edit into
  a running measurement; a set of three "consecutive runs" was invalidated that way.
- **`performance.memory` has a hard ~50 ms refresh floor** (measured: no dwell
  shorter than 49.90 ms). Per-frame heap attribution is impossible; per-second is
  fine. Values are byte-exact, not 100 KB-quantized, contrary to folklore.
- **`HeapProfiler.stopSampling` returns only SURVIVING objects.** It reported
  0.1–0.4 MB/s against a measured 108 MB/s because it is blind to short-lived
  garbage. Use `getSamplingProfile`.
- **A metric that does not discriminate is not a metric.** "Frames over 8.33 ms"
  scored the empty arena at 48.5% and the heaviest fight at 57.6%. Count frames
  over 1.5 refresh periods instead — that separated them by two orders of magnitude.
- **Let the judge be a script.** The bar was agreed in advance and then reported
  against by hand — the report quoted the best of four runs on the one criterion it
  came closest to, and never mentioned the second criterion at all. Not dishonestly;
  it wrote down the number in front of it. `scripts/fps-verdict.mjs` exists so the
  verdict is not the author's to phrase.

---

## V. Process lessons, which cost more than the technical ones

- **State the target in the user's own units.** A target of "0 frames over 16.7 ms"
  was written and defended for hours. 16.7 ms is the **60 Hz** period — half the
  rate that was asked for. The judge script even declared `BUDGET_MS = 8.333`, the
  real number, and never used it. A manager struck the target. If the request says
  "120 fps and flat graphs", the target is 8.333 ms and a spread measure — nothing
  else needs inventing.
- **A limitation of your instrument is not a defect in the goal.** "The probe is
  DEV-only so this can't be judged fairly" was argued at length. The answer was one
  sentence: the target was a dev-build target, and an instrument that only works in
  dev is a thing to fix, not a reason to move the bar.
- **Drive the mechanic through a seam, and know what the seam does.** `wave-N` on
  the debug seam is not "send more enemies" — it calls `createArenaCombatState`, a
  full reset: kills to 0, corpses gone, blood orphaned, player teleported. Every
  fight measurement taken across it was capped at a few seconds of accumulation —
  the exact thing being complained about — and every kill count was "kills since
  the last reset".
- **Measure the thing as played.** The first segments had a standing player who
  never fired: no blood, no gibs, no ragdolls, no corpses. They also slept 2.5 s
  past the spawn, excluding the single most expensive frame of a wave.
- **Cross-tabulate the columns you already record before adding one.** The largest
  defect of the session — a 27–37 ms frame on every kill — sat unread in three
  successive reports whose `textures` column named it.
- **Don't publish an attribution before checking it.** "First-use texture upload"
  went into a report and had to be retracted; the arithmetic that killed it took
  minutes.

---

## VI. Where it stands, honestly

Judged against the audited target — every wave in two consecutive runs: mean
≤ 8.5 ms, p99 ≤ 12.5 ms, and **no single interval ≥ 25 ms**:

- **mean: passes.** 8.34–8.48 ms per wave, i.e. 118–120 fps, with 98.5–99.9% of
  intervals a single 120 Hz frame.
- **p99: passes**, 8.4–8.5 ms in most wave-runs (16.6 ms in one).
- **max: FAILS, and this is the remaining work.** Two named, reproducible defects:
  1. a **233 ms freeze once per session**, about two seconds into the first fight.
     Proven to be first-of-run by moving it into a warmup wave — W1 then drops to
     a 25 ms max. Not a shader link (`programs` never rises). Cause still unnamed.
  2. a **25–42 ms burst of 6–9 frames at every wave change**, from unmounting 12
     bodies and mounting 12 more. Absent from W1 only because re-dispatching
     wave 1 reuses the same enemy ids and React reconciles instead of remounting.
     The real fix is a slot pool; staggering trades peak for total and the
     teardown half measured worse.

Also open: nothing disposes on the retirement path beyond the skeleton; geometry
churn fires 27/204/284 times inside a single wave; `fps-verdict.mjs` still reads
only the discredited probe's `report.json` and must be pointed at
`external.json`; and no compositor cross-check exists at the current code state.
