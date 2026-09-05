---
name: fixed-tick-gameplay
description: Keep all gameplay logic independent from render FPS. Use for any work on player input, movement, combat, abilities, cooldowns, enemy AI, projectiles, damage, loot, encounter state, animation timing, cameras, `useFrame`, frame-rate caps, fixed ticks, simulation clocks, replay, interpolation, or multiplayer snapshots in this project. Applies to system designers and programmers.
---

# Fixed-tick gameplay

Gameplay is never driven by the render-frame delta or by the selected FPS cap.
Rendering is presentation only. The canonical project contract is
`docs/system-design/TECHNICAL_ARCHITECTURE.md`, ADR-01.

## Non-negotiable boundary

```text
input commands → fixed simulation tick → state/snapshots → render interpolation
```

- Run authoritative gameplay at a named fixed timestep (currently 30 Hz).
- Keep simulation state framework-free: no React, Three, camera, animation mixer,
  DOM event or Photon object in domain state.
- Treat `useFrame` delta and `maxFps` only as elapsed presentation time. They must
  never directly advance movement, cooldowns, casts, AI, projectiles, damage,
  rewards or encounter progression.
- Interpolate only continuous presentation fields between previous/current
  snapshots. Treat casts, deaths, teleports, target changes and event IDs as
  discrete boundaries.

## How the tick reaches the renderer — a STORE, never state above the consumers

The boundary above says what the tick may not read. This says how what it
produces gets out, and it is the rule this project learned the expensive way: an
arena whose frame times were "hellishly unstable" turned out to be one `useState`
in the wrong place, and the same mistake had been made independently in three
files.

**A publish is a data hand-off, not a reconciliation.** `useState` invalidates the
whole subtree beneath it, so publishing a tick into state held ABOVE the
consumers makes the cost proportional to the TREE rather than to the number of
things that read it. Measured in this repo: the solved state was held at the top
of the arena scene, and every publish re-rendered the sky, four lights, the VFX
light pool, both shadow groups, the cathedral geometry and the `<Physics>`
provider — **none of which read a snapshot.**

The rules:

- **Publish through a store** — a value plus a subscriber set — and let each
  consumer subscribe with `useSyncExternalStore`. A store hands the value to the
  components that display it and to nothing else.
- **Put the state where it is READ, not where it is convenient to write.** In an
  ordinary app that is an ergonomics choice. Under a per-frame publisher it is a
  frame-cost decision, and it must be made as one.
- **If a value is only ever consumed inside `useFrame`, pass a REF, not state.**
  Publishing it buys nothing: the consumer was going to read it in its own frame
  callback anyway. This repo published in-flight blood droplets as state and
  re-rendered the entire arena scene 120 times a second to move quads that the
  receiving component moved itself.
- **Fixing one publisher while another stands fixes nothing.** Three publishers
  fed the same tick here — scene presentation, HUD snapshot, blood marks. Moving
  the first one down was reported as done while the second kept re-creating the
  whole scene from above on the same tick. Grep for every `useState` and
  `setState` reachable from the tick before claiming a cascade is gone.
- **Advance the accumulator by SUBTRACTING the interval, not by zeroing it.**
  Zeroing discards the remainder, so the gate lands on a tick boundary instead of
  the interval it names. At a 125 Hz tick a `1/30` threshold first fired on the
  fifth tick — a real publish rate of 25 Hz, and every comment in the feature
  saying "30 Hz" was wrong because of it.

**A game object's identity is not a React key.** Entities are components here, so
it is tempting to let reconciliation identity carry game identity. It does not: a
body that changed key from `id` to `id-remains` when it died was, to React, one
object leaving and a different one arriving — a fresh skinned-mesh clone, a fresh
skeleton and a fresh set of ragdoll colliders, in the frame of the kill. One
element per body, one stable key, with phase as a PROP.

## The physics solver is gameplay too — never step it with a frame delta

A physics world is a simulation, and it inherits the whole boundary above.
Handing it `useFrame`'s delta looks like the "smooth" option and is the same
class of mistake as running a cooldown off the render clock — except it fails
violently instead of silently.

**Rule: the solver advances by a FIXED step, accumulating whatever real time has
passed. A raw frame delta never reaches it.**

Why it is worse than the usual frame-rate coupling: a stalled frame is not
milliseconds, it is SECONDS — another build hogging the machine, a switched-away
tab, a long GC, a shader compile. One integration step that long does not just
run gameplay fast, it violates every constraint in the scene at once. Measured on
a settled ragdoll in this project, with a variable step and a 3-second stall:

| stall | result |
|---|---|
| none | body asleep at y = 0.15 |
| 3 s | launched to y = 29.8 in two seconds |
| 3 s (a second scene) | y = 252 |
| 6 s | y = 579, still climbing |

The binding was clamping the delta — at **half a second** — and taking a single
step with it. A clamp is not a fix; the fix is sub-stepping. With a fixed step the
same stalls moved the body 0.000 m.

Practical checks:

- Any physics binding's "variable / vary / raw delta" mode is a red flag. If it
  exists because a fixed step looked steppy, the real problem is missing render
  interpolation of the write-back, and that is where the work belongs.
- Interpolation offered by a binding usually applies only to bodies IT manages.
  Bodies created directly on the world are not smoothed by it — do not assume the
  smoothness came for free.
- Test the stall. Block the page's main thread for a few seconds mid-scene and
  look at what the simulation did. Nothing else in a test suite produces the
  multi-second frame that real machines produce every day.

## System designer responsibilities

Before implementation, specify:

1. the fixed rate, tick order, authoritative state and command schema;
2. the input, simulation, snapshot and presentation module boundaries;
3. behaviour after focus loss, a long frame, hidden tab or authority loss — never
   leave a local player in a permanent unobservable input freeze;
4. which values interpolate and which are events; and
5. replay and real-browser acceptance criteria at 30, 45, 60 and uncapped FPS.

Do not approve a design that says "multiply by delta" as its gameplay-timing
model. Do not use FPS as a game rule, timeout, cadence, cooldown or movement
unit.

## Programmer responsibilities

- Sample DOM/touch input into ordered commands; consume each edge exactly once in
  a fixed tick. Held input is sampled separately.
- Run every gameplay writer through one fixed-tick owner. Do not add a second
  independent `useFrame` gameplay loop.
- Keep rendering hooks read-only over snapshots. VFX, audio, animation and camera
  may observe events but may not create hits, cooldowns, rewards or movement.
- Never publish a tick into `useState` held above its consumers. Use a store and
  `useSyncExternalStore`, or a ref where the consumer reads it in `useFrame`. See
  the section on how the tick reaches the renderer.
- Put pure clock, command, replay and interpolation rules in `systems/` with unit
  tests. Keep React/Three adapters in `components/` or `entities/`.
- Do not make a long visual frame permanently disable input. If authority handoff
  is not implemented, define and visibly verify a safe local recovery policy
  before enabling the runner.

## Required verification

- **Measure the interval the player waits, not the interval between renders.** A
  frame time sampled end-of-render to end-of-render is, under vsync,
  `period + (work[i] − work[i−1])` — a FIRST DIFFERENCE of the work signal. It
  invented a defect that did not exist in this repo for most of a day. The
  signature: a mean of exactly one refresh period, lag-1 autocorrelation near
  −0.5, frames shorter than a refresh interval, and a smooth distribution where a
  real dropped-frame process is spiky at multiples of the refresh. A
  `requestAnimationFrame` interval IS a presentation interval — use
  `scripts/arena-frames-external.mjs`, which records one from an init script and
  shares no code with the app.
- **Report the max and the share of clean intervals, not just p99.** A wave here
  reported `p99 = 8.5 ms` while containing a 233 ms freeze: one frame in 1600 does
  not move a 99th percentile.
- **Run it twice and report both.** Tail statistics on this bench drift 25–30%
  between runs; a single run is not evidence, and quoting the better of two is how
  a report passes a bar the product does not.
- Replay one command stream under 30, 45, 60, uncapped and jittered rendering;
  gameplay outcome must match.
- Stall the frame loop for several seconds mid-simulation (block the main thread)
  and confirm nothing moved that was at rest, and nothing gained energy. A
  multi-second frame is the normal condition on a busy machine, not an edge case.
- Cover quick clicks, held buttons, several inputs between rendered frames,
  blur/refocus, long frames and death/evade/cast boundaries.
- Verify the real playable route in a headed browser. Send actual pointer and key
  input, then confirm both gameplay response and live simulation diagnostics.
- A reduced FPS cap may reduce smoothness only; it must not alter controls,
  animation state, movement, attack cadence, camera, damage, cooldowns,
  projectiles or encounter outcome.
