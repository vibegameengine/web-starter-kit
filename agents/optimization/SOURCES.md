# Optimization Evidence Register

## Method

This register records the measurements that produced the rules in [KNOWLEDGE_CORE.md](./KNOWLEDGE_CORE.md). Unlike a reading list, almost none of it comes from documentation: a renderer's cost is a property of a machine, a build and a scene, and the only admissible evidence is a number taken from the running thing.

"Evidence of relevance" states the number and which rule it supports. "Limits" states what the measurement cannot say — which matters more here than in most domains, because the commonest failure in this role is a true number about the wrong quantity.

Every entry below was taken on a development build, on one Windows machine, on a 120 Hz display (an 8.333 ms budget), in a browser harness. **Treat every absolute figure as evidence, not as a constant.** Re-derive the budget from the platform each time; carry the *mechanisms* forward, not the milliseconds.

## Instrument sources

| # | Source | Evidence of relevance | Used for | Limits |
|---|---|---|---|---|
| 1 | Presentation-interval recorder (rAF loop installed before application code) | Produced the only distribution that behaves like delivered frames: median at exactly one refresh period, and a clean split between single and doubled intervals. | The primary metric for all smoothness claims. | Still runs on the page's main thread; it observes cadence, not where the time went. |
| 2 | Compositor frame timestamps (CDP screencast) | Agreed with the rAF series on the mean to within 0.06–0.76 ms, which is what licenses using the cheap recorder. Disagreed on the tail. | One-time validation of the proxy. | Lossy under load — a **floor** on delivery. Costs ~2 ms/frame, so it cannot be left on. |
| 3 | In-canvas probe sampling at end-of-render | Its own output falsified it: mean exactly the display period, lag-1 autocorrelation −0.49, 29% of frames under 7.33 ms, some at 2.5 ms. | The worked example of an instrument measuring the wrong quantity (KNOWLEDGE_CORE §2.1). | Do not use for spread or p99. Its draw-call and resource columns remain useful. |
| 4 | Renderer info counters (draw calls, triangles, programs, textures, geometries), sampled per frame | Cross-tabulating these against slow frames named the mount cost and excluded shader compilation outright (`programs` never moved). | Attribution of a slow frame to content arriving vs. work on unchanged content. | Reset by the renderer at each render pass — must take ownership of `autoReset` and read after all passes, or the count describes the last pass only. |
| 5 | `performance.memory` heap readings | Rises and GC drops balanced to 0.2%, heap flat on 84% of frames, no quantization-sized steps — establishing 108 MB/s as real, not an artifact. | Allocation rate per second; GC detection by drop. | Hard refresh floor around 50 ms. **Per-frame attribution is impossible.** Chrome-only. |
| 6 | Sampling heap profiler | Reported 0.1–0.4 MB/s against a measured 108 MB/s. | Worked example: the *stop* call returns only surviving objects and is blind to short-lived garbage. | Use the call that returns the full profile. |
| 7 | GPU timer query extension | GPU mean 0.88 ms, p50 0.45, p99 4.04 of an 8.4 ms frame — the direct proof the frame was CPU-bound. | Separating GPU cost from main-thread cost. | Frequently withheld by the browser. Results arrive several frames late; correlate over a segment, never pair with one interval. |
| 8 | DEV world seam (start encounter, set state, force event, query snapshot) | Made every measurement start from the same state and be re-runnable, and made "measure while shooting and killing" possible at all. | Driving the subject without playing by hand. | A debug verb may not do what play does — see entry 14. |

## Measurements that produced a rule

| # | Measurement | Evidence of relevance | Supports | Limits |
|---|---|---|---|---|
| 9 | Simulation state moved out of component state held above the world, into a store with per-consumer subscription | Clean-interval share 88 / 86 / 95% → **99.6–99.9%**; p99 16.8 → **8.5 ms**; mean 9.49 / 9.58 / 8.74 → 8.34–8.48 ms. Reproduced across two runs. | §3.1 — the largest single cause found. | One codebase, one framework. The mechanism (state placement invalidates the subtree) is general; the magnitude is not. |
| 10 | Full-surface texture re-upload vs. dirty rectangle, A/B/C run twice with a warmup | Full: p99 55.4 / 46.8 ms. Dirty rect: 15.8 / 15.6. No-upload control: 15.4 / 15.5. The fixed path sits **on** the control. | §3.6. | Surface size and update rate specific. The control arm is what makes it interpretable. |
| 11 | Per-death entity rebuild removed (stable key) | Combat max frame 41.0 → 27.7 ms; frames over two periods 19 → 4 per 1662; per-fight texture creation +9 → +3. | §3.5 — and the correctness regression it caused, §5.1. | The correctness cost was discovered later and is the more important half. |
| 12 | Wave mount staggered, peak vs. total | Peak 84 / 133 / 134 → 29 / 33 / 35 ms. Total over budget 84 / 147 / 134 → 76 / 155 / 148 ms — a wash. Teardown staggering: 12 → 20 frames over budget. | §3.7 — staggering trades peak for total. | Bench run-to-run drift is 25–30%; the totals here are inside it, which is itself the finding. |
| 13 | Frame cap added at the display's own rate | sd 1.62 → 2.26; p99/mean 1.539 → 1.644; near a refresh multiple 64.0% → 43.8%; frames under 7 ms 10.2% → 19.5%. | §3.10 — falsified. | Specific to a loop-throttling implementation on a display already at that rate. |
| 14 | The same encounter driven by the debug "start wave" verb vs. played through its own transition | The debug verb recreates the whole state — teleports the player, rebuilds the weapon, zeroes counters. Every measurement across it was capped at a few seconds of accumulation, which was the exact thing under investigation. | The gate "measure the thing as played"; the seam's verbs must be read before being trusted. | — |
| 15 | Whole encounter recorded continuously, no debug resets, 240 s | 28,774 intervals: mean 8.34 ms, p50 8.3, p99 8.4, **100.0%** single-period intervals, 10 intervals over two periods. | The final smoothness claim, and the demonstration that the transition burst was largely a harness artifact. | Single continuous run; the harness limitation it exposed is the transferable part. |
| 16 | Collider set built in a memo with an empty dependency list, against an asynchronously loaded height grid | `{gridReady:false, slabs:0}` — no collision floor for the life of the page. After the fix, `{gridReady:true, slabs:193}` and bodies resting at −0.15 m instead of −60 to −645 m. | §5.2 — the latent-bug pattern, and the chain-print rule that found it. | — |
| 17 | Confident diagnosis predicting −4.6 m displacement, against an observed −641 m fall | Two orders of magnitude apart, checkable before any edit; three edits in three subsystems were made instead, one of which broke the build. | §1.2 and §5.4 — the numeric-prediction check. | — |

## Documentation and engine source consulted

| # | Source | Evidence of relevance | Used for | Limits |
|---|---|---|---|---|
| 18 | Renderer source: partial texture copy path | The cheap CPU upload branch is taken only while the source texture has never been bound; otherwise it blits from a GPU copy. Mipmap regeneration fires after a level-0 copy. | §3.6, both traps. | Version-specific. A comment is not a guard — re-read it on upgrade. |
| 19 | Renderer source: lazy per-skeleton bone texture on first draw | Explains a texture count rising by exactly the number of rigged bodies mounted, and kills the "first-use albedo upload" hypothesis. | §4, first row; §3.9. | Version-specific. |
| 20 | Animation system: clip/action caching by clip and root | Licenses sharing one clip across many instances while forbidding shared mixers and skeletons. | §3.8. | — |
| 21 | Project skills: `fixed-tick-gameplay`, `threejs-scene-architecture`, `threejs-instancing-materials`, `world-debug-seam`, `visual-verification-gate`, `never-break-the-shared-tree` | Each owns a surface this role touches; the store rule from §3.1 has been written back into `fixed-tick-gameplay`. | Mandatory loads before an edit. | Project-local. |

## Standing caveats

- Every figure here is from a **development build**. Unminified framework code and dev-mode instrumentation cost real time that a shipped build does not pay. When the requester's target is a development build, say so; when it is not, re-measure there.
- Absolute milliseconds are machine-specific. Ratios, mechanisms and falsifications transfer; thresholds do not.
- The residual matters. In the deepest attribution attempted here, 56–66% of over-budget time could not be attributed to any recorded counter. Report the residual rather than implying the named causes account for everything.
