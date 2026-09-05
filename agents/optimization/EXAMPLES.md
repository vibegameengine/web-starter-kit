# Calibrated Optimization Examples

These show the minimum accepted level of reasoning. Numbers are drawn from real investigations and are labeled; never reuse them as benchmarks — they are machine-, build- and scene-specific.

---

## Example 1: "The fps is hellishly unstable" — a full investigation

### 1. Symptom restated as an observable

- `Reported`: unstable frame rate; wants a stable 120 fps and "graphs flat as threads on every wave".
- `Observable`: the share of **presentation intervals** that are a single refresh period, measured on each wave, with the player firing and killing — not standing still.
- `Budget`: the display's refresh period. At 120 Hz that is **8.333 ms**. This is the only number the request supplies; every other threshold must be justified out loud.
- `Second observable`: "flat as a thread" is about **spread**, so p99 near p50, plus the maximum interval. A mean alone cannot express it.

### 2. Instrument note

- rAF interval recorder installed before application code, so it shares nothing with the subject.
- Validated **once** against compositor timestamps: agreed on the mean to within 0.06–0.76 ms. Then switched off, because it costs ~2 ms/frame.
- Blind spots stated: observes cadence, not where time went; runs on the same main thread.
- The in-engine probe is **not** used for spread — it samples at end-of-render, which under vsync is a first difference of the work signal.

### 3. Baseline, twice

| wave | mean | p99 | clean intervals |
|---|---|---|---|
| 1 | 9.49 ms | 16.8 | 88.2% |
| 2 | 9.58 ms | 16.8 | 86.1% |
| 3 | 8.74 ms | 16.7 | 95.4% |

Run-to-run spread on the tail: 25–30%. Any effect smaller than that is not a finding.

### 4. The cut

Parts that can fail independently, each settled on its own:

| part | test | result |
|---|---|---|
| GPU / fill rate | quarter the shaded pixels | `ok` — mean moved 9.65 → 9.42 while a full-res *repeat* gave 9.22 |
| shader compilation | program count per frame | `ok` — never moved |
| draw-call count | segments at 35 vs 320 calls | `ok` — held 118 fps at 320 |
| texture upload of the effect surface | A/B/C with a no-upload control, twice | `faulty` — p99 55.4 vs 15.8 vs 15.4 |
| per-frame state publishing | move the state below its consumers | `faulty` — the largest single cause |

### 5. Localized cause

A number and a node, not a story: the simulation's solved state was held in component state **above** the world, and every publish invalidated the sky, the lights, both shadow groups, the level geometry and the physics provider — **none of which read it**.

### 6. One change, re-measured twice

| wave | after (run 1 / run 2) |
|---|---|
| 1 | 8.48 / 8.47 ms, p99 8.5, **99.9% / 99.9%** |
| 2 | 8.39 / 8.40 ms, p99 8.5, **99.6% / 99.6%** |
| 3 | 8.38 / 8.43 ms, p99 8.5, **99.6% / 98.9%** |

p99 equals p50. That is "flat as a thread" expressed as a number.

### 7. Falsified, with the number that killed each

- *first-use texture upload at spawn* — the texture delta equals the rigged-body count exactly (6/10/10); the maps were already resident.
- *garbage collection* — 384 ms of 8468 ms over budget (4.5%).
- *GPU-bound* — GPU mean 0.88 ms of an 8.4 ms frame.
- *simulation allocation* — 0.3–0.4 MB/s, two orders short.
- *a frame cap will pace it* — made every metric worse (sd 1.62 → 2.26).

### 8. Residual, stated

56–66% of over-budget time could not be attributed to any recorded counter. Reported as a residual rather than implied away.

### What makes this a passing artifact

The budget came from the platform. The instrument was validated against something outside itself. There is a control arm. Two runs, both reported. Five falsifications with numbers. The residual is named.

---

## Example 2: A regression hunt — how it should go, and how it went

### The symptom

"After death, bodies fall through the ground."

### How it should go — two moves

1. **Print the whole chain**, leaf → root, with the world position at every level: wrapper → model root → bone.
   Result: model root at `[12.9, 0.3, 18.3]` — correct, on the tile it died on. Bones at −97 to −641 m, and **diverging**. Placement is fine; this is free fall. Therefore: no collider.
2. **Print the collider set's state.** `{gridReady:false, slabs:0}` — the memo that builds the collision floor has an empty dependency list and ran before an asynchronously loaded height grid arrived. Zero colliders for the life of the page. Fix the dependency; `{gridReady:true, slabs:193}`, bodies rest at −0.15 m.

### How it actually went — six moves, one broken build

1. Assumed the cause was a recent performance commit. **Never checked whether the symptom reproduced before it.**
2. Accepted a subagent's confident diagnosis — live numbers, arithmetic, a prediction of **−4.6 m** displacement — against an observed **−641 m** fall. Two orders of magnitude, checkable for free. Not checked.
3. Edited the rotation. No effect.
4. Edited the placement guard. No effect.
5. Reverted four files in a shared tree. Broke the build — old files over a newer tree is a state that never existed.
6. Restored, then finally printed the chain. Answer immediately.

### The rules this produces

- A diagnosis whose numeric prediction disagrees with the symptom by an order of magnitude is dead, however well argued.
- **"Falling" and "displaced" are different observables** — one grows with time, the other does not — and they are distinguishable before any edit.
- Measure the object the requester described, not its parent. Measuring the wrapper returned "normal" three times, and each false negative was read as "clean here, look further".
- Never roll back a shared tree to test a hypothesis. The question is "does it reproduce *before* my change", and the tool is an isolated copy.
- Two moves with no change in the observable: stop editing and start measuring.

---

## Example 3: A report that would be rejected

> "Optimized the arena. Frame times are much better now — mean 8.36 ms, 119.6 fps, p99 8.5. The wave transition still has a small hitch but steady combat is smooth."

Rejected for six reasons, all of which were real mistakes:

1. **One run.** Tail statistics drift 25–30%; three other runs of the same code read p99 16.6–16.7 and max 41.7.
2. **The better run was quoted.** Honestly — it was the number in front of the author — and that is exactly why the judge must be a script.
3. **The failing criterion is missing.** The agreed bar had two clauses; only the one it came closest to is reported.
4. **No maximum.** A wave reporting p99 8.5 ms contained a 233 ms freeze.
5. **No residual.** It implies the named causes account for everything.
6. **"Small hitch" is not a number.** It was 6–9 intervals of 25–42 ms at every wave start.

The same result, reported acceptably: *"Two runs on an unchanged tree, both reported: 99.9% / 99.6% single-period intervals, p99 8.5 ms both runs, max 25.1 / 33.4 ms. Remaining: 4–5 intervals of 25–33 ms at each wave transition, cause named (12 bodies unmount, 12 mount), not fixed. Residual unattributed: see the register."*
