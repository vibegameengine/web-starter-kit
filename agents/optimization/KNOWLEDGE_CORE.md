# Optimization Knowledge Core

## 1. Operating Model

Optimization is a measurement discipline that happens to end in a code change:

`symptom → observable → budget → instrument → baseline → cut → localized cause → one change → re-measure → record, including the dead ends`

The unit of work is not an edit. It is a falsified hypothesis. A pass that produced no falsifications did not look hard enough.

### 1.1 Evidence Levels `[Mandatory operating standard]`

Label every recommendation. A label in a heading governs everything under it until the next labeled heading.

- `Measured`: a number produced by an instrument, twice, on an unchanged tree.
- `Mechanism`: read from the source of the engine or the framework, with the file and the branch named.
- `Falsified`: a hypothesis with the measurement that killed it. These are first-class and must be kept.
- `Internal heuristic`: a decision aid this role uses, not an externally validated threshold.
- `Hypothesis`: plausible, unverified. May not justify an edit.
- `Platform constant`: refresh period, buffer sizes, driver behaviour. Re-derive per machine; never carry a measured constant to another one.

An unlabeled performance claim is a hypothesis regardless of how many digits it contains.

### 1.2 The Localization Rule `[Mandatory operating standard]`

This is the most important rule in this file. It exists because ignoring it once cost an hour of edits in three subsystems, one broken build, and a diagnosis that was confidently wrong.

> Until a **number** that is observably wrong and the **node** where it first becomes wrong are both named, there is no edit, no revert and no commit.
>
> For any "the object is not where it should be", the first action is to print the **whole chain** from the scene root to the final **visible** node — wrapper → model root → bone/mesh — with the world position at every level, and find the first link where the number departs from expectation. Measure the object the requester described, never its parent: the direction is always **leaf → root**.
>
> A diagnosis that produced no numeric prediction agreeing with the observed symptom to within an order of magnitude is a hypothesis, not a diagnosis. An outside diagnosis — including one from a subagent — has no force until that comparison is made, however many figures it contains.

Three corollaries, each learned by violating it:

- **Measure the observable, not a proxy you control.** Measuring the wrapper group's transform when the *bones* were falling produced "normal" three times, and each false negative was read as "clean here, look further in the same area".
- **"Falling" and "displaced" are different observables.** One grows with time, the other does not. They are distinguishable before any edit, and confusing them sends the search into the wrong subsystem entirely.
- **Two moves with no change in the observable means stop and switch class of action** — from *editing* to *measuring*. A requester asking twice what you are doing is the same signal from outside.

### 1.3 Cost of a Move `[Internal heuristic]`

An edit is the most expensive move available and the least informative. When an edit does not help, you have learned nothing: the hypothesis may be wrong, or right but implemented wrong, or right with a second cause behind it.

A bisecting print is O(1) in the number of hypotheses. Enumerating hypotheses is O(n). For a spatial or hierarchical fault the print is always cheaper, and that is arithmetic, not taste.

---

## 2. Measurement

### 2.1 Measure the interval the player waits `[Measured]` `[Mechanism]`

Sampling frame time at end-of-render to end-of-render gives, under vsync:

```
delta[i] = refreshPeriod + (work[i] − work[i−1])
```

which is the **first difference** of the work signal, not the interval anyone waits. Its signature:

- mean exactly equal to the display period;
- lag-1 autocorrelation near −0.5 — every long frame repaid by a short one;
- frames **shorter than a refresh interval** (impossible as a presentation interval);
- a smooth unimodal distribution, where a genuine dropped-frame process is spiky at multiples of the period.

A regression of that delta on draw calls, triangles, GC and GPU time returns R² ≈ 0.12, because you cannot regress a first difference against levels. This instrument invents a defect that is not there.

A `requestAnimationFrame` interval **is** a presentation interval. Install the recorder before application code (`page.addInitScript` in a browser harness) so it shares nothing with the subject and survives a build where the app's own probe cannot exist.

### 2.2 Report the max and the clean-interval share, not p99 alone `[Measured]`

A wave reported `p99 = 8.5 ms` while containing a **233 ms freeze**. One frame in 1600 does not move a 99th percentile. Report:

- the share of intervals that are a single refresh period — the "is it smooth" number;
- the maximum, and the frames on either side of it — the hitch a player remembers.

### 2.3 Two runs, both reported `[Measured]` `[Internal heuristic]`

Tail statistics drift 25–30% between runs on identical code. One run is not evidence. Reporting the better of two is how a report passes a bar the product does not — and it is an easy mistake to make honestly, by writing down the number in front of you.

### 2.4 A second profiler will fight you for the counters `[Mechanism]`

An in-canvas performance panel typically takes ownership of the renderer's info object — sets `autoReset = false` and resets it from its own pre-frame effect. With two owners the loser reads zero, and the tell is a panel showing `0 calls` beside a populated geometry and texture count. Unmount it before recording, and assert that it is gone rather than assuming.

### 2.5 A run needs a warmup segment `[Measured]`

Without one the first heavy segment pays the whole run's one-time costs — the shader link, the first-use texture uploads — and an A/B compares a treatment against the cost of going first. Two thirds of one headline result was exactly that.

It cuts the other way too: a once-per-session freeze becomes visible only in a harness *without* a warmup, because a settle delay sleeps straight through it.

### 2.6 A metric that does not discriminate is not a metric `[Measured]`

"Frames over one budget period" scored an empty scene at 48.5% and the heaviest fight at 57.6% — sampling jitter around the vsync boundary, not dropped frames. Count intervals past **1.5 periods** instead; that separated the same two by two orders of magnitude.

### 2.7 Stamp provenance into every report `[Internal heuristic]`

Record the commit and whether the tree was dirty. Reports carrying only a free-text tag concealed that the probe itself was edited mid-experiment — provable afterwards only because later reports had fields the earlier ones lacked. A clean SHA on a dirty tree is a lie; write both.

Never edit the instrument or the code between the two halves of a comparison. Hot module replacement applies a source edit into a running measurement.

### 2.8 Instrument blind spots worth knowing `[Mechanism]`

- Browser heap readings refresh on a coarse interval (a hard floor around 50 ms observed). Per-**frame** allocation attribution is impossible; per-second is fine.
- A sampling heap profiler's *stop* call typically returns only surviving objects — blind to short-lived garbage. It reported 0.4 MB/s against a measured 108 MB/s. Use the call that returns the full profile.
- GPU timer extensions are frequently withheld. Report `null`, never `0`: "could not measure the GPU" and "the GPU was idle" must never be confused.
- A compositor-level frame record (screencast timestamps) is the closest thing to an external witness, but it is lossy under load — a **floor** on delivery — and costs about 2 ms per frame. Use it once to validate the cheap recorder, then turn it off.

### 2.9 Let the judge be a script `[Internal heuristic]`

A bar agreed in advance and then evaluated by hand is not a bar. Write the judge, point it at the recording, and let it print the verdict — including the clauses that fail. The author of a change is the worst possible reader of its result.

---

## 3. Where frame time actually goes in a retained-mode / React renderer

Ordered by what they cost when measured, not by how often they are discussed.

### 3.1 Where UI-framework state lives is a frame-cost decision `[Measured]` — the largest single cause found

A fixed-timestep simulation published its solved state ~30 times a second into component state held **above** the world. Component state invalidates the whole subtree beneath it, so every publish re-rendered the sky, the lights, both shadow groups, the level geometry and the physics provider — **none of which read that state**.

The same mistake had been made independently in three places, which is the signature of an architecture inviting it rather than a bug.

Fix: publish into a **store**, and let each consumer subscribe individually. Measured effect: clean-interval share 88/86/95% → **99.6–99.9%**, p99 16.8 ms → **8.5 ms**.

The rule: **a publish is a data hand-off, not a reconciliation.** Put the state where it is *read*, not where it is convenient to write. In an ordinary application that is an ergonomics choice; under a per-frame publisher it is a performance decision and must be made as one.

### 3.2 A value read only inside the frame callback is a ref, not state `[Measured]`

In-flight particles were published as state and re-rendered an entire scene 120 times a second in order to move quads that the receiving component moved itself in its own frame callback. Publishing bought nothing.

### 3.3 Fixing one publisher while another stands fixes nothing `[Measured]`

Three publishers fed the same tick. The first was moved down and reported fixed while the second kept re-creating the whole scene from above on the same tick, making the first fix inert — and a twenty-line comment claimed the opposite of what the code one file away did. Enumerate every state setter reachable from the tick before claiming a cascade is gone.

### 3.4 Subtract the interval; do not zero the accumulator `[Mechanism]`

Zeroing discards the remainder, so the gate lands on a tick boundary rather than the interval it names. At a 125 Hz tick a `1/30` threshold first fired on the **fifth** tick — a real publish rate of 25 Hz, and every comment in the feature saying "30 Hz" was wrong because of it.

### 3.5 A game object's identity is not a reconciliation key `[Measured]`

When entities are components, it is tempting to let the framework's identity carry game identity. A body that changed key on death was, to the framework, one object leaving and a different one arriving — a fresh skinned-mesh clone, a fresh skeleton and a fresh set of physics colliders, in the frame of the kill.

**And the reverse is a trap of equal size.** Making the key stable removes that cost and silently changes *when* one-time lifecycle work runs. See §5.1: it broke corpse placement, because a "place me once" guard had been spent at spawn.

### 3.6 Full texture re-upload `[Mechanism]` `[Measured]`

Marking a large canvas-backed texture dirty re-uploads all of it — a 2048×2048 RGBA surface is ~16 MB, and during activity something changes almost every frame. Send the **dirty rectangle** instead.

Two traps, both hit:

- The cheap CPU upload path is chosen only while the source texture has never been bound as a real texture. Hand it to a material, or initialize it, and the copy silently switches to a framebuffer blit from a GPU copy that was never written — black rectangles, no error, no warning.
- **One union bounding box cannot express two disjoint regions.** Stamps cluster where events happened; a periodic fade touches a tile elsewhere. Unioned, the box spans both and trips the "larger than half the surface, just do a full upload" guard — so the tiled fade's entire purpose is defeated on every frame the fade runs. Track the regions separately.

### 3.7 Mounting heavy runtime objects `[Measured]`

A wave mounted 6–12 rigged bodies in one commit: a frame of 84 / 133 / 134 ms.

**Staggering trades peak for total.** Admitting a few per frame cut the peak roughly fourfold and raised the total time over budget (84/147/134 → 152/181/165 ms). It does not make the work cheaper; it decides how many frames it lands on. **Read the total column, not just the peak** — the first staggered version turned a freeze into a longer stutter and was one report away from being called a fix.

Budget by **cost**, not by count: procedural bodies drawn from module-scope singletons cost nothing to mount, and charging them the same as a rigged body lets one frame spend its whole allowance on free work.

**Staggering the teardown measured worse** (12 → 20 frames over budget). Holding dead objects alive keeps their physics bodies in the world; the cost is not removed, it is paid alongside the mounts it was meant to make room for.

### 3.8 Cache what every instance of a kind could share `[Measured]`

Per body, per mount, all avoidable:

- layered animation clips — cloning a clip deep-copies every track's typed arrays (~730 KB and ~330 track objects per body) and then discards half;
- the collision-fitting vertex walk — ~21k vector allocations, plus a linear bone lookup inside the per-vertex loop where the skin index already *is* the bone index;
- the material clone, when a cache scoped inside a per-body memo claims to be per-source-material and is not.

Clips and measured point clouds are data and may be shared. **A skeleton and an animation mixer must never be shared between live instances** — two bodies driving one skeleton is two bodies in the same pose in different places.

### 3.9 Disposal `[Mechanism]` `[Measured]`

Engines lazily build a per-skeleton bone texture on first draw, and a skinned clone gets a new skeleton per instance. With nothing calling dispose, textures climbed 72 → 200 across one run and never came down; a segment reporting zero live entities still held 118.

Whoever owns a resource frees it. An instance owns its skeleton and its mixer. Materials and geometry are shared — disposing them takes the texture out from under living siblings.

### 3.10 A frame cap is not a presentation pacer `[Falsified]`

The reasoning was sound: the distribution was not quantized to the display, so the renderer was free-running and carried its own jitter. Adding the missing cap made **every part of it worse**:

| | unlimited | capped at the refresh rate |
|---|---|---|
| standard deviation | 1.62 | **2.26** |
| p99 / mean | 1.539 | **1.644** |
| near a refresh multiple | 64.0% | **43.8%** |
| frames under 7 ms | 10.2% | **19.5%** |

A loop-level frame cap throttles the render loop; it is not a presentation pacer, and on a display whose refresh already matches the cap it fights vsync instead of riding it. **With no headroom the trade is pure loss.** Revisit only once the frame is genuinely cheaper than the budget.

---

## 4. Falsified hypotheses `[Falsified]`

Keep these. A recorded dead end is worth more than a recorded success: the success gets re-derived from the code, the dead end gets retried by everyone.

| Believed | Killed by |
|---|---|
| The spawn hitch is first-use texture upload | The texture delta equals the count of rigged bodies in the batch, exactly, because it is one lazily-built bone texture per skeleton. The archetypes' maps were already resident. **A rising counter is not a cause.** |
| Garbage collection is the cause (108 MB/s measured) | GC-marked frames total 384 ms of 8468 ms over budget — 4.5%. Removing all of it moves the mean ~0.05 ms and p99 not at all. |
| Per-frame DEV telemetry is the allocator | Gating off a per-frame per-body 49-node scene traversal: 109.0 → **108.4** MB/s. Nothing. (Worth removing anyway — it also wrote a single global that every body overwrote, so it was unusable with more than one subject.) |
| The simulation's per-tick objects are the allocator | Driving the tick directly: **0.3–0.4 MB/s**, two to three orders of magnitude short. |
| The frame is GPU-bound | Quartering the shaded pixels moved the mean 9.65 → 9.42 ms while a *repeat* at full resolution gave 9.22. Then directly: GPU mean **0.88 ms** of an 8.4 ms frame. |
| Draw calls are the problem (240–320 against a ~30 budget) | Real but secondary: 25–29% of over-budget time, and the scene held 118 fps at 320 calls. Worth ~1.2 ms of mean and nothing on the spread. |
| Staggering the mount fixes the spawn hitch | Caps the peak, raises the total. See §3.7. |
| Staggering the teardown, by symmetry | Measured worse. See §3.7. |

---

## 5. Regression hunting

### 5.1 A performance change alters lifecycle, and lifecycle carries correctness `[Measured]`

The single most dangerous class of optimization is the one that changes *when* something is created or destroyed. Two examples from one change:

- Making an entity's key stable removed a per-death rebuild — and spent a "place me once" guard at spawn instead of at death, so the death coordinates were written by nobody. The body sat at the origin and its physics bodies fell out of the world.
- A frame loop wrote all three components of a rotation while the declarative props reset only one. Harmless while the object was recreated on transition; catastrophic once it was reused, because the leftover components survived into a frame that was then moved to the origin.

**Before shipping any change to mounting, unmounting, keys or reuse, enumerate every "do this once" guard in the objects affected and say when each now fires.**

### 5.2 Symptoms that look identical and are not `[Measured]`

An object placed correctly and then falling looks exactly like an object placed wrongly. The chain print separates them in one move: if the root is right and the leaves are far away and *diverging*, it is free fall — a missing collider, not a placement bug.

The actual cause in that hunt: a collider set built in a memo with an **empty dependency list**, which ran before an asynchronously loaded height grid arrived, produced zero colliders, and never re-ran for the life of the page. There was no floor at all. `{gridReady:false, slabs:0}` said in one line what three edits had failed to.

**Any `useMemo`/`useEffect` with an empty dependency list that reads asynchronously-loaded global state is a latent version of this bug.** Grep for them at the start of a fall-through or missing-collision investigation.

### 5.3 Do not roll back a shared tree to test a hypothesis `[Internal heuristic]`

A partial manual revert produces a state that never existed — old files over a newer tree — and the build breaks in a way that is a consequence of the method, not bad luck. It also has zero resolving power: four files reverted at once cannot say which one mattered.

The right question is not "is my change to blame" but "**does the symptom reproduce before my change**", and the right tool is an isolated copy of the tree. The requester's working tree is never the experiment.

### 5.4 The confident wrong diagnosis `[Measured]`

A diagnosis arrived with live numbers, arithmetic, and a specific prediction: a displacement of −4.6 m. The observed fall was −641 m. **Two orders of magnitude, checkable for free, before any edit.** The form of evidence had been mistaken for evidence, and a prior belief about which commit was at fault anchored the search inside four files that did not contain the bug.

The check costs one move: take the number the diagnosis predicts and compare it to the number the symptom shows. If they disagree by an order of magnitude, the diagnosis is dead regardless of how well argued it is.

---

## 6. Communication during an investigation `[Internal heuristic]`

- Before any long-running tool, say what is running, what number is expected, and what would falsify the current hypothesis. A requester should never have to ask what is happening.
- A repeated "what are you doing" is **data about the work**, not an interruption of it — it is an outside measurement of observable progress, which is precisely the thing the investigator cannot see.
- When a hypothesis is falsified, say so with the number, in the same message. A silent pivot to the next hypothesis reads from outside as no progress at all.
- Never report a criterion that passed while omitting one that failed, and never quote the better of several runs. Both are easy to do honestly and both destroy the report's value.
- High activity at zero knowledge-gain is the failure mode that is invisible from the inside: edits land, files change, it feels like motion. Track *hypotheses eliminated per move*, not moves.
