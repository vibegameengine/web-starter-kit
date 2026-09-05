# The documents in here

Two kinds, and it matters which you are reading.

**How this kit is built.** [`architecture.md`](architecture.md) and
[`pipeline.md`](pipeline.md) describe this repository: its layers, its
build-time asset path, its readiness gate. They are current, and a change that
contradicts one of them is a change that should update it.

**What was learned building a game on it.** Everything else. These came back
from the production game this kit was distilled from, kept where the technique
they describe ships here:

| Document | The technique it is about |
| --- | --- |
| [`agent-lessons.md`](agent-lessons.md) | how work goes wrong in a repository like this one, each entry with the evidence |
| [`frame-cost.md`](frame-cost.md) · [`frame-cost-lessons.md`](frame-cost-lessons.md) | where a frame's time actually goes, and the hypotheses that died proving it |
| [`prefab-placement-lessons.md`](prefab-placement-lessons.md) | putting a hand-authored piece of world into a generated one |
| [`camera-feel.md`](camera-feel.md) | why a first-person turn feels bad, and why every cause is a timing problem |
| [`mob-ragdoll-and-animation.md`](mob-ragdoll-and-animation.md) | skinned creatures, their clips, and the ragdoll they collapse into |
| [`rigging-a-weapon-arm.md`](rigging-a-weapon-arm.md) · [`rigging-a-quadruped.md`](rigging-a-quadruped.md) | rigs that come out wrong, and the measurement that settles each one |

Read them for the mechanism and the numbers, not for the file paths. **They cite
the game's own instruments** — `scripts/arena-fps-probe.mjs`,
`scripts/fps-verdict.mjs`, `scripts/verify-imp.mjs` and others — **and those
scripts stayed with the game.** A path that does not resolve here is a pointer
into that repository, not a broken link to something this one is missing. What
travelled is in `src/shared/`, `src/features/ragdoll/` and `vite/`; the arena,
the bestiary and the level kit did not.
