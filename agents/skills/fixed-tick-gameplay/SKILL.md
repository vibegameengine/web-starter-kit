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
- Cover quick clicks, held buttons, several inputs between rendered frames,
  blur/refocus, long frames and death/evade/cast boundaries.
- Verify the real playable route in a headed browser. Send actual pointer and key
  input, then confirm both gameplay response and live simulation diagnostics.
- A reduced FPS cap may reduce smoothness only; it must not alter controls,
  animation state, movement, attack cadence, camera, damage, cooldowns,
  projectiles or encounter outcome.
