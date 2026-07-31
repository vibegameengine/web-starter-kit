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
- Put pure clock, command, replay and interpolation rules in `systems/` with unit
  tests. Keep React/Three adapters in `components/` or `entities/`.
- Do not make a long visual frame permanently disable input. If authority handoff
  is not implemented, define and visibly verify a safe local recovery policy
  before enabling the runner.

## Required verification

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
