# Skinned creatures: animation, ragdoll, and the traps between them

Written after building a first skinned, animated,
collapsing creature — and getting most of it wrong at least once first. Everything
here is a measurement, not an opinion; where a number appears, the command that
produced it is named.

The intended reader is whoever adds the SECOND one. Most of what follows will
cost you an afternoon each if you rediscover it.

---

## 1. The shape that works

```
features/<creature>/
  systems/<creature>Animation.ts    pure — no React, no three, no clock. Testable.
  systems/boneLayers.ts        cuts one take into lower/upper bone layers
  components/use<Creature>Animation.ts   steps the machine on the FIXED tick
  components/useHeadAim.ts     per-frame additive turn on top of the take
  entities/<Creature>/use<Creature>Rig.ts     clips, mixer, crossfades — presentation only
  entities/<Creature>/<Creature>.tsx     the entity, and the API a script drives it with
  ui/<creature>-lab.lab.ts + <Creature>LabScreen.tsx
scenes/<creature>-lab/<Creature>LabScene.tsx
scripts/build-<creature>-model.mjs   the asset pipeline
scripts/verify-<creature>.mjs        the acceptance
```

Two divisions carry the whole design:

**Decisions are simulated, playback is presentation.** The machine decides which
take is playing and is aged by the fixed tick; the mixer plays it on the render
frame. A transition then takes the same wall time on any machine, and the same
decisions drive a body in a lab, in a scene, or in a test with no mixer at all.

**Continuous state travels by ref, discrete state travels as data.** Speed and
facing change every frame; a prop that changes every frame re-renders the entity
and the ragdoll under it sixty times a second. So `drive({ speed, facing })` and
`place()` write refs, while deaths and strikes arrive as monotonic COUNTERS in
props. A counter cannot be missed between two ticks nor played twice, which a
flag can be both.

---

## 2. Asset traps, in the order they bite

### `?meshopt` rewrites the skin, and `Skeleton.pose()` believes it

The optimizer's quantization step rescales and re-centres vertex positions and
rewrites the inverse bind matrices to compensate. The drawn body is identical.
But `Skeleton.pose()` rebuilds bones from those matrices, so the recovered BIND
POSE comes back in the optimizer's space — measured on one rig, an inverse-bind
scale of 0.4998 against the source asset's 1.0000, i.e. a skeleton at twice size.

Everything measured in that pose is then wrong: capsules twice as thick, and the
factor rides into `syncToSkeleton`, which decomposes it straight onto
`bone.scale`. The body visibly doubles the instant it dies.

Fixed in `ragdoll/systems/mixamoRig.ts` (`poseToBind` normalizes the bind pose to
the size the body actually lives at). **Not** by dropping the optimizer — see
AGENTS.md #5, which this incident wrote.

### A capture carries the size of the rig it was recorded on

Mixamo takes write the pelvis height in ABSOLUTE metres. Imported untouched onto
a differently-sized character they plant it at the hip height of the mannequin
they were captured on — knees through the floor, every frame. the model build script
matches each take's rig to the character's and bakes the difference in.

### Rest pose and bind pose are two different things

One capture disagreed about them: the skin said the pelvis stands at
y = 1.005 while the joint's own rest transform put it at z = 1.005 — a Z-up rest
under a Y-up mesh. Nothing renders wrong while an animation plays, which is
exactly what makes it a trap: the rest pose is what the body falls back on the
moment nothing is playing. The build script now sets rest = bind.

### Scale belongs in the asset, never in a prop

A ragdoll's rigid bodies live in world space and its capsules are measured off
the bones, so a scale above the model is counted twice and the solver fights a
skeleton of a different size. the model build script bakes the height.

And CHECK IT AGAINST THE GAME, not against the capture. That body shipped at the
1.00 m it was authored at until someone stood it next to this game's cast —
archetypes at 1.45, 1.85, 2.20 and 3.50 m.

### A generated rig has no Mixamo leaf ends

`HeadTop_End` and the finger tips are export-time extras. Without the crown node
the head capsule has nothing to span. the model build script measures it from the
mesh — and from the SKULL, not the top of the mesh: on a horned creature the
topmost vertices are two clusters 12 cm apart with their mean 10 cm off the
bone's axis. Measure in the skull's central column.

---

## 3. The ragdoll fits the body, and the body is not the mannequin

`RagdollFitOptions` exists because two bodies in this project genuinely need
different answers. All of it defaults to what the mannequin always did, so a new
option cannot regress a working body by accident.

| option | what it does | measured on that body |
|---|---|---|
| `capsulesFromMesh` | thickness from the mesh, not from a fraction of bone length | thigh 0.132 → 0.055 |
| `selfCollision` | whether segments of one body touch each other | see below |
| `angularDamping` | scales how hard limbs resist turning | x1 → settles 1 run in 3; x8 → 4 in 4 |
| `hipExtension` | extra room for the hip to swing back | MEASURED AND REJECTED: 1 in 4 |
| `buckle` | scales the death-fold reflex | 0.45 → the corpse is repeatable |

### Measuring a limb's thickness: use the NEAREST surface per direction

The obvious statistic — a high percentile of every vertex's distance from the
bone axis — measures a GARMENT on any character wearing one. The first body's loincloth
is weighted to its hips and thighs and dragged the percentile to a thigh of
0.162 m on a 0.411 m bone: a body built of spheres as wide as itself.

Flesh is present in every direction around a limb; cloth only adds far points in
some of them and can never remove the near ones. So: bucket the vertices by angle
around the bone, take the NEAREST in each bucket, and take the percentile across
directions. Same body: 0.055.

**Known limitation, not yet fixed.** This is right for a limb, whose bone runs
down its middle, and wrong for a TRUNK, whose spine runs near the back: the
nearest surface behind it is centimetres away. Measured, the mannequin's torso
comes out at 0.036 against an authored 0.097 — thinner than its own arm. Nothing
uses it today because the mannequin does not opt in. Fix it before the next creature
does.

### A capsule may not swallow the joint it carries

The two hips and the two shoulders keep their contacts on so a limb cannot pass
through the trunk. That makes a trunk capsule wide enough to reach past its own
hip anchor into a pair the solver pushes apart for the rest of the corpse's life
— it never comes to rest. `measureSpec` now clamps each radius by the distance
from its axis to those anchors. It does not bind on the mannequin.

### Anatomical capsules and self-collision are one decision

An anatomically wide trunk also intersects limbs it is not JOINTED to, and
nothing filters those pairs. Turning contacts off at the four trunk joints is not
enough; the whole body has to stop touching itself, which is what
`selfCollision: 'off'` and the shared collision group do. The cost is that a limb
may pass through the body, and every engine pays it.

---

## 4. Bone layers, and what they buy

`boneLayers.ts` cuts a take at the pelvis: hips and legs below, spine and above.
Both halves play at once, at full weight, because their tracks address disjoint
bones.

Two things become possible that a single-clip rig cannot do at all:

- **Striking while running.** The legs keep the stride while the swing takes the
  spine and arms — out of one authored run and one authored swing, rather than a
  run-and-swing take per gait.
- **Retiming the legs alone.** A run played faster to keep the feet planted
  speeds up the whole body with it, and a body sped up wholesale reads as film at
  the wrong speed. Split, the stride chases the ground speed while the torso
  keeps something near its authored cadence — measured at 5 m/s: legs x1.70,
  torso x1.21.

The cost is honest and worth stating: two layers of one take at two rates DRIFT
out of phase, so the arm swing stops being locked to the stride. The way to have
both is a second take authored for the faster gait, blended by speed.

Match bone names in BOTH spellings. Mixamo bones are `mixamorig:LeftUpLeg`;
three's glTF loader strips the colon. Matching one spelling produces an EMPTY
layer — a clip that plays perfectly and animates nothing. Include the leaf ends
(`Toe_End`) or an attack take gets permission to write the toes.

---

## 5. Additive head aim, and the two ways it breaks

`useHeadAim` turns the neck and head off the take's own pose every frame. Two
guards, each of which is a bug that happened first:

**Compounding.** Adding a rotation to what the mixer wrote is only safe while the
mixer is writing. The moment it stops — a take faded out, a body that died — last
frame's turn is still in the bone and adding to it again spins the head like a
top. So compare the bone against the value the hook LEFT in it: unchanged means
the mixer did not write, and the previous turn comes out before the new one goes
in.

**Releasing.** "Stop watching" is not "stop calling look()". The last target
stays in the ref forever — measured, eight seconds after the toggle the head
still held the turn. Whoever aims must call `look(null)` on the way out.

Spread the turn across neck AND head, or the skull rotates and the throat does
not follow.

---

## 6. How to be sure — and how I fooled myself for five hours

### Measure the CONTROL as well as the body under test

The ragdoll's rig builder is shared code, so a change made for one body can
quietly move the ruler. The acceptance script measures the mannequin in
`/labs/ragdoll-lab` on every run for exactly this reason, and it caught a
regression the same hour it was introduced.

It also settles arguments the body under test cannot. Twice I concluded something
about the first body that the control refuted:

- "The first body never settles because its hip capsules overlap." The mannequin
  violates the same inequality MORE and settles fine. Not the cause.
- "The 0.70 corpse-span floor is above what a healthy corpse does — look, the
  control reads 0.611." Split the control's readings by whether it had SETTLED:
  every settled run reads 0.728, and only the unsettled ones read 0.611. The low
  numbers were not a healthy corpse, they were an unfinished measurement.

### A threshold is calibrated against the body that PASSES

Deleting a check that one body fails and another passes is removing a failing
test, not replacing a bad ruler — and the two are only told apart by looking at
the body that passes. I moved that floor three times before being made to put it
back.

### Beware a proof whose inputs have moved

I declared a prescribed fix "arithmetically impossible" using a thigh radius of
0.162 m. The measurement stopped producing that number an hour later (0.055). I
never re-derived the conclusion. **A conclusion reached by reasoning has to be
re-derived when its inputs change**, and a conclusion recorded in a journal looks
just as settled either way.

### Know what your instrument actually measures

`__ragdollSpan.drawnSize` is the AABB DIAGONAL of the eleven driven bones — not a
pairwise distance, and not the mesh. I built a whole argument on it being bounded
by the longest bone chain; a box diagonal is always ≥ the max pairwise reach and
can exceed it by up to √3. The control proved it: the mannequin STANDING measures
102.5% of that "ceiling".

Corollary: `drawnSize / mesh height` compares a bone span to a mesh height, and
those are different fractions on different bodies — the first body's bones reach 60.3%
of its mesh height, the mannequin's 78.6%. A hunched creature with horns is
penalised for geometry, not behaviour.

### Small batches of a stochastic quantity are not evidence

This is the one that cost the most. Whether a corpse settles inside four seconds
is a coin with a bias, and I read batches of four and six as if they were facts:
"6 out of 6", "4 out of 4", "2 out of 4", "1 out of 4" — each one steering the
next change. When the same configuration was finally measured under two different
scenarios it gave 3-of-4 and 2-of-4, and the "third variable" I had invented to
explain the disagreement (how long the body ran before dying) turned out not to
exist.

**Before tuning against a rate, characterise its noise.** Twenty runs of the
untouched body, once, would have saved most of a session — so at the very end I
finally did it: **15 settled out of 20, a 75% rate**, with the corpse's size
spread over 1.02–1.20 m.

Read that back against the batches that steered the work. Under a 75% coin,
"6 out of 6" happens 18% of the time, "4 out of 4" 32%, "2 out of 4" 21%,
"1 out of 4" 5%. Every sample I collected is consistent with ONE unchanged rate.
Which means none of the tuning is demonstrated by the data used to justify it —
not the damping, not the buckle, not the clamp. They may each be improvements;
the measurements taken do not show it. Telling a ten-point shift from noise needs
something like 50–100 runs per arm, not four.

There is a second consequence, for whoever writes the acceptance. A criterion of
the form "`settled` is true" is ONE sample of that coin, so it fails about a
quarter of the time whatever the code does. A rate has to be judged as a rate:
"at least 18 of 20", measured once, is a threshold that code can move and that
you can see move.

### Write the criterion BEFORE the run

A verdict journal, kept beside the bench, holds the hypotheses: each row carries the
criterion, the prediction, and what would falsify it, written before the command
is run. Five of twenty-one rows are falsified — including two of my own
conclusions. That is the format working, not failing.

---

## 7. Where a creature is driven from

```ts
const creature = useRef<ImpApi>(null)
<Creature apiRef={creature} ragdoll onDied={...} />

creature.current.drive({ speedMetersPerSecond, facingRadians })  // every frame, no re-render
creature.current.strike('swipe')                                  // upper layer, legs keep running
creature.current.kill({ point, impulse })                         // death and the blow in one call
creature.current.place([x, y, z], yaw)                            // spawn or teleport
creature.current.look(target)                                     // or null to let it go
```

Two paths to death exist on purpose: a simulation that already tracks the body
raises `events.death`, because it owns that fact and the counter hands over the
exact tick; anything else calls `kill()` and need not know a counter, a ragdoll or
a mixer exists. There is deliberately no `revive` — the machine's death state is
terminal, and a collapsed body is rebuilt rather than stood back up, because its
pose now belongs to the solver.

The ragdoll's own handle is NOT exposed. It used to be, and it was a trap twice
over: its `activate()` could never win against the entity's own `active`, and its
`hit()` on a living body queued an impulse that fired whenever the body later
happened to die.

---

# Measuring a corpse — and every way it went wrong

Everything below was paid for once. The **KIT** marks are lessons that hold in
any project with a ragdoll, a skinned rig, a build-time asset step or a headed
bench; they are not about the body under it.

## KIT — a size in metres, written in code, is already stale

`IMP_AUTHORED_HEIGHT = 1.7` was correct on the day it was typed. Over one task
the asset was rebuilt at 0.9995, then 2.55, then 1.70 m — each time by ordinary
work on the build script, each time silently. Everything computed against the
constant came out by a constant factor while every RATIO stayed perfect, which
is the most confusing way for a size bug to present.

Read the size FROM the asset. `useImpRig` measures it off the geometry and the
skin's inverse binds; `Creature` reports it through `read().heightMetres` so nothing
downstream keeps a second copy. **Any absolute length written in a consumer is a
copy of something the asset already knows.**

Two of this task's longest hunts were this one bug wearing different clothes:
the size knob that looked broken (ratios exact, absolutes 1.51x off), and the
bench's killing blow, which was an impulse of `15` at a point `0.62 m` up —
fitted to a one-metre body and still there at 1.70 m, landing near the hips. The
impulse now carries the CUBE of the height, because that is how a uniformly
scaled body's mass scales; the point is a fraction of it.

## KIT — comparing two bodies by "corpse vs standing span" needs the SAME pose

The argument was: the first body's corpse spans 102% of what its skeleton spans
standing, the reference mannequin's only 92%, so the first body's ragdoll opens up
BETTER and the failing threshold must be the wrong ruler.

It was wrong, and an independent reviewer killed it. The mannequin's standing
span is measured in a **T-pose** (`startPoses.ts` — the lab's default), the
that body's in a compact, arms-in stance. The ratio then measures how splayed the body
was BEFORE it died, not how well the solver opened it: a body dropped from a
T-pose must score under 100%, one dropped from a crouch must score over. Drop
the arm bones from both boxes and the gap disappears — 1.18-1.24 against
mannequin 1.13-1.20, overlapping.

**Two bodies are only comparable through a pose-independent quantity, or through
the same pose.** Check that before the conclusion, not after someone doubts it.

## KIT — a boolean throws away the measurement that would have answered you

`settled` was sampled something like ninety times across the task. The
continuous quantity behind it — time to come to rest — was never sampled once.
Batches of four to six runs "proving" a tuning arm were all consistent with one
unchanged rate; at p~0.75, six-for-six happens 18% of the time.

Report `mean`, `sd` and `n`. `min..max` hides a shifted distribution behind one
lucky tail, and a count of successes hides everything except its sign.

## KIT — when two instruments disagree, suspect the denominator

A bench and an acceptance script read the same global and disagreed by 45% while
each had a 2-4% spread. Batches of twenty runs were spent on it. Both were
right: they divided by the asset's authored height, and the asset was rebuilt
between the runs. **A ratio has two halves, and the boring half moves too.**

## The buckle reflex is NOT what curled this corpse — and how that was missed

**Retracted.** The section below is kept because the way it went wrong is worth
more than the conclusion was.

`buckle: 0` did not disable the reflex. Zero is a number, it passed a
`!== undefined` guard downstream, and it armed a position motor at target zero —
"hold this joint straight, stiffly", the opposite of "do not fold". So the A/B
compared the authored fold against a stiff extensor, and the winner was the
extensor. The apparent gain, 0.612 to 0.682, was legs being straightened by a
motor.

With the option fixed so that zero means off, measured: corpse span **0.559**,
against 0.61-0.69 with the authored fold, and still not settling. The reflex is
better than no reflex. The first body keeps it.

**KIT — an "off" switch that is a falsy number is not an off switch.** A guard
written as `!== undefined` accepts `0`, and a feature that reads its own
disabled value as an instruction is the hardest kind of bug to see: everything
runs, nothing throws, and the measurement comes back with a story in it.

**And the method failure, which is the same one twice.** The reading that made
`buckle: 0` look good was `farthestXZ`, chosen as "the discriminator between a
curled body and an extended one". It is not: it measures distance from the
WORLD ORIGIN, so a corpse that slid further from zero scores higher without
opening up at all. Two measurements in one task, both trusted without reading
what they computed — `drawnX/Y/Z` (a centre, read as a size) and this one.
**Read the field's definition before you build a conclusion on it.**

## What the falsified section claimed

After death the knees and elbows are driven into a fold so the body gives way
instead of toppling like a plank. On this body it overshot: corpses came to rest
knelt up, knees under the chest, spine humped.

Measured, twelve running deaths per arm, kill point and impulse already fixed:

| | horizontal reach | diagonal | settled |
|---|---|---|---|
| buckle on (authored) | 0.750 | 1.075 +/- 0.060 | 11/12 |
| `buckle: 0` | **1.001** | 1.117 +/- 0.069 | 10/12 |

Reach is the discriminator, not size: a curled body and an extended one can
share a diagonal, and only the horizontal extent separates them. A third of the
body's reach was being folded away, and rest was unaffected.

The first body carries `buckle: 0`. The mannequin keeps the authored reflex — it is a
per-body option for exactly this reason.

## Falsified here, so it is not retried

- **A contact pair on the NECK.** The neck is the one trunk joint without
  `contacts`, and the head does sink chestward without one. Switching it on cost
  the mannequin its span (0.728 -> 0.644) AND its rest (settled -> not), and
  moved the first body 0.612 -> 0.606. Reverted; the reason is written beside the row.
- **Angular damping x8 and a scaled buckle, tuned together.** Removed: 15/20
  against 14/20 is one observation, not an effect.
- **"The corpse-span floor is geometrically unreachable."** Withdrawn. The span
  is an AABB **diagonal**, which is not bounded by the longest bone chain — it
  can exceed the largest pairwise distance by up to sqrt(3).
- **"The physics stand is non-deterministic because the solver steps once per
  frame."** False. `@react-three/rapier` keeps a proper accumulator
  (`while (accumulator >= timeStep) stepWorld(timeStep)`), so simulated time
  follows the wall clock, not the frame counter.

## The method failure, which cost more than any of the bugs

One acceptance threshold — corpse span >= 0.70 of authored height — was not met.
Across the task it was lowered to 0.50, deleted, restored, lowered to 0.55,
restored again; then a second ruler was added beside it that the body passed;
then, when that was removed, an argument was produced that the ruler itself was
wrong for this creature. Five shapes, one act.

The tell is not the threshold moving. It is **re-deriving a justification for
missing your own bar instead of measuring the thing the bar points at.** The bar
pointed at a real defect the whole time: the corpse curled, and one twelve-run
A/B on an option that already existed found it.

The reviewer that broke the argument also caught the cheapest error in the file:
a corpse screenshot was presented as proof the body lies extended, while another
frame from the SAME procedure, listed as inspected in the same report, showed it
curled. Both are draws from one distribution. **One frame of a stochastic system
is an anecdote; say n, or say nothing.**

---

## The settle criterion was never a coin — it was a distribution on the deadline

For most of this task the first body "settled within four seconds" about three times in
four, and that was treated as a stochastic outcome to be tuned or argued with.
Measuring the CONTINUOUS quantity took one scene and twelve deaths, and answered
it immediately:

    time to rest: mean 3.55 s, sd 0.94, median 3.43, max 5.07, rested 12 of 12

The body always comes to rest. It just takes, on average, 3.55 seconds against a
four-second deadline — so roughly a third of deaths cross it. There was never a
coin: there was a distribution sitting astride the line, and every batch of four
to six runs was sampling which side it landed on.

**KIT — a pass/fail deadline over a continuous quantity manufactures a coin.**
Ninety samples of the boolean said less than twelve samples of the number. If a
criterion is "X within T", measure X; the boolean is what you report afterwards,
never what you tune against.

Falsified with the same instrument, immediately: `angularDamping: 3`, which the
option's own documentation suggests for capsules measured from a thin mesh —
3.96 s mean, sd **2.00**, worst case 8.37, against 3.55 +/- 0.94 and 5.07
without. More damping does not settle this body; it lets it balance in unstable
positions for longer. The mean barely moved and the TAIL doubled, which is the
part a deadline actually cares about and the part a mean alone hides.

## KIT — the bench is not evidence, and must not live where evidence lives

Reviewable captures belong in the git-ignored `wip/<task>/`, which is this
project's rule and a good one: screenshots are not source.

The DRIVER that produces them is source. For a whole task this one sat in
The bench began as a 348-line script under `wip/` — seventeen scenes, the single instrument
behind every number in this document — one `git clean` from being gone, while
the document quoting its output was safely committed. Every measurement here
would have become an unrepeatable claim.

It belongs in `scripts/`, and it is there now. The captures still go to `wip/`. The test for
which is which: **if losing it would make a recorded number unrepeatable, it is
a tool, and tools are committed.**
