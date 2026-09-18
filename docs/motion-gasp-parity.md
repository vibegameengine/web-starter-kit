# Where this system matches GASP, and where it diverges

Reference build: `E:\EpicVaultCache\GameAnimationSample_5.8` (GASP) and the engine
source at `C:/GameEngien/UE_5.8`, read directly. The second reference is the
Godot project at `C:\Users\pavel\projects\AIGamess\notapain`, whose procedural
leg layer is more mature than GASP's in the parts GASP leaves to its asset
count.

Scale, stated plainly: GASP ships 2345 animation assets, 1405 of them
locomotion, indexed into 161 pose-search databases across 4 LOD groups with 34
schemas. This system has 6 clips (5 sources, one mirrored) and one database of
205 poses. Everywhere GASP answers a question with another shot clip, this
system has to answer it by computation. That is the whole shape of the
divergence below.

## Selecting what to play

| | GASP | here |
| --- | --- | --- |
| choice of database | chooser table on ~17 inputs picks ONE of 161 databases | a chooser on one input: the speed the body actually carries, with a band around the crossover |
| choice of clip | pose search inside that database | angular blend of the nearest two directional clips of the chosen gait |
| choice of frame | pose search returns clip AND time | phase integrated from distance travelled; the search never moves the playhead |

**Diverges in breadth, matches in shape.** GASP narrows the search space with a
chooser (stance, gait, movement state, direction, LOD) and only then compares
poses; `systems/gaitChooser.ts` does the same job from speed alone. It had to
exist: leaving the gait to the pose search meant a body at 2.65 m/s still
played the walk clip, whose own travel is 1.633, with the stride warp stretched
to 1.27 to cover the difference. The same sprint now plays the run at a warp of
0.967.
Here the space is small enough that narrowing is unnecessary, and moving the
playhead by search was actively harmful: it froze the walk cycle at phase 0.36
for 30 frames because every search re-seeked to the matched pose's own time.
The search now chooses *which* clip only; distance drives the phase.

Worth noting that GASP itself does the same thing for cycling loops. Its
`PSS_Relaxed_Loops` schema compares **Curve(Phase) + Heading + Trajectory and
nothing else** — no pose comparison at all. Our loop path is closer to that
schema than to `PSS_Default`.

## Phase

GASP bakes a phase curve per clip from the footstep notifies
(`AM_BakePhaseCurveFromFootstepNotifies`) and feeds it to the search as a
feature, so a switch or a blend lands in phase.

The phase is a RATE here, not a position: it is integrated as distance over the
current stride length. Recomputing it each frame as a division looked equivalent
and was not — the stride length moves with speed, so every change of the warp
dragged the phase backwards and the pose jerked up to 33 degrees in a frame.

Here the same information is **measured** off the clip rather than authored:
`scripts/measure-animations.mjs` samples 64 frames per foot, takes the longest
run below `lo + 0.30 * range` over the doubled array, and writes per-clip stance
windows. `systems/phaseAlign.ts` turns the left-foot plant into phase zero and
offsets every other clip onto it, so the directional blend puts the same foot
down at the same time.

**Matches in intent, diverges in source.** Notifies are authored; windows are
measured. The measurement is the only option here — the clips are Mixamo, with
no notifies.

## Directions

GASP has roughly ten shot directions per gait per stance and lets the chooser
plus the search pick among them.

Here: `walk-forward`, `walk-backward`, `walk-strafe-right`, its mirror
`walk-strafe-left`, `run-forward`, `run-backward`. `systems/directionalBlend.ts`
takes the travel angle in body space, picks the nearest two by angle and weights
them so they sum to one, and returns the blended clip speed for the stride
split.

**Diverges: fewer clips, warping in their place.** The diagonal is the case that
proves it. Before the blend it played the strafe clip at 1.105 m/s against that
clip's own 0.576 m/s, so the stride warp stretched to 1.385 and no foot could
physically stand still. With the blend the same diagonal reports clip speed
1.072 against 1.105 travelled: warp 1.015, and the plant holds.

## Speed and stride

GASP: `AnimNode_StrideWarping` with `strideScale = locomotionSpeed /
rootMotionSpeed` (`AnimNode_StrideWarping.cpp:209`), the foot target scaled
about the point under the hip along the stride direction (`:233-247`), and the
play rate set by the chooser.

Here: `splitSpeedRatio` splits the speed ratio into cadence `sqrt(ratio)`
clamped to [0.85, 1.6] and stride `ratio / cadence` clamped to [0.7, 1.9] — that
split is notapain's rule, not GASP's — and `systems/strideWarp.ts` then warps
the foot targets the way the Unreal node does.

The sprint used to be 1.625 × the walk, 2.65 m/s — slower than the run clip's
own 2.84 m/s, so a sprint played as a run slowed down. On the clip-paced
profiles it is now notapain's ratio, three times the walk (`movement_tuning.gd`,
walk 2.0, run 6.0): 4.9 m/s, the excess split between cadence and stride as
above. GASP's own gait speeds live in binary assets and were not read.

**Diverges in policy, matches in mechanism.** GASP leans on play rate and clip
count; here a real walk lengthens its stride as well as quickening its cadence,
because there is no second clip to switch to.

One measured fact behind these numbers: the walk clip's own ground speed is
**1.633 m/s**, not the 1.012 the pipeline first reported. The old estimator and
its validating residual shared a "dominant foot" rule, so they agreed at the
wrong answer. Replaced by an unbiased sweep in Blender — bake each candidate
speed, take the median per-frame *minimum* world foot speed, read the V-curve
minimum. The walk had been running 40% too slow for its own stride.

## Orientation and the body

GASP: `OrientationWarping` (pelvis toward travel, spine counter-rotated),
`Steering`, and `OffsetRootBone` to separate the mesh from the capsule.

Here: orientation warp is in (`systems/orientationWarp.ts`, limit pi/3, pelvis
toward travel with the spine counter-rotated over three bones). `Steering` and
`OffsetRootBone` are **not**.

**Diverges; the missing half is the next structural piece.** Without
`OffsetRootBone` the mesh is rigidly the capsule, so every turn is a turn of the
whole body. Turning itself is programmed here on purpose — there are no turn
clips in this system at all, and the converted turn GLBs have been deleted from
the asset folder so nothing can pick them up.

## Feet

UE's `AnimNode_FootPlacement` plants on **speed and distance**: `WantsToPlant`
(`:706`) asks for near-ground AND slow, `DeterminePlantType` (`:601`) unplants
past `UnplantRadius` (35 cm) or `UnplantAngle` (45°) and replants within 0.35 and
0.5 of those, `FinalizeFootAlignment` (`:855`) pushes the foot out of the ground,
`SuddenMotionOnly` (`:1599`) separates a capsule's sudden step from the pelvis,
`SeparatingDistance` (`:1800`) keeps swing feet apart, and
`UpdatePlantOffsetInterpolation` springs every offset.

Here the pass (`components/footPlacementPass.ts`) is a port of notapain's
`foot_ik_prep.gd`, constants included, with Unreal's pieces added where
notapain has nothing or measured worse:

- **contact, correction, stance lock, pull-to-edge, pelvis drop** — notapain's,
  as written: contact from the stance window and the gap to the ground, the
  lock taken on the rising edge of stance, a stance foot past an edge walked in
  toward the body in six steps, the pelvis lowered by the deepest planted drop.
- **ground probe** — notapain's ray, from 0.5 m above the foot to 0.8 m below it.
  The port had two defects here, both found this session: the ray stopped 0.3 m
  below the foot instead of 0.8, and it was a 4 cm box rather than a ray. The box
  caught the corner of a ledge under a foot whose ankle and toe were both past
  it, and the foot was drawn 20 cm up on a sliver of edge.
- **release of a plant** — Unreal's, not notapain's. notapain holds a plant to
  90 cm of drift and has no angle at all; a body stepping sideways walked off its
  own locked foot and left it under the other leg. `systems/plantTwist.ts` ports
  `DeterminePlantType`: full hold up to 35 cm or 45° of foot yaw, then let go
  (latched, as Unreal latches it), and **Replanted** — a released foot that still
  wants to stand plants again where it is drawn once it has come back within
  0.35 × 35 cm of the animated foot. Without replanting a foot that stood through
  a stop released its stale lock and then drifted with the idle pose forever.
- **push-out** — Unreal's `FinalizeFootAlignment`: ankle and ball each checked
  against the ground under them, the foot lifted straight up, nothing else
  moved; the clip's own penetration is allowed, measured against the
  character's floor as `DistanceToPlant` is.
- **the character stands where its feet stand** (`systems/supportHeight.ts`,
  `useFootPlacement.ts`). The drawn body stands on the ground its lowest planted
  foot finally rests on — after the lock and the push-out, not under the
  animated foot — carried between supports by Unreal's damper, with the
  collider only bounding the drift. Reading the ground under the animated foot
  instead lowered a body with both feet on a ledge 20 cm into a crouch; the same
  ledge now stands the hips at 0.889 m over the low foot, the height they have
  on flat ground.
- **feet never cross** — Unreal's `SeparatingDistance` could not be ported as it
  stands: its plane sits at the midpoint of the *animated* feet and moves only a
  swing foot, so it cannot see a planted foot the body has walked away from, and
  that is exactly how the legs crossed here (a locked foot 26 cm under the other
  leg on a turn into a run). `systems/footSeparation.ts` is mutual placement,
  invented because GASP does not have it: the gap is measured between where the
  two feet are actually going, across the line of the hip joints; the free foot
  is sprung apart (Unreal's floor spring, stiffness 1000) until the gap is as
  wide as the clip had it, up to 10 cm; and a locked foot the body has dragged
  more than 5 cm inward is released, after which Unreal's unplant eases it back.
- **knee pole** — notapain's, 0.8 m in front of the animated knee, with "in
  front" read from the line between the hip joints rather than the body's
  facing. Orientation warping has already turned the legs toward the travel by
  the time the IK runs, as it has in Unreal; a pole along the body's facing bent
  those turned legs sideways, and on a diagonal run one knee swung 15 cm in
  across the other. The ankle-to-toe line was tried first and rejected: at
  toe-off the toe hangs under the ankle and the line flips.
- **foot orientation** — notapain's `FootRotate`, as written: the solved foot
  is tilted by up→normal, weighted by contact, and level ground leaves it as the
  clip rolled it. Before it the foot was levelled toward the bind pose on every
  surface, which flattened a foot rolling onto its toes and lifted the whole
  sole off the tread. And the foot now keeps the world rotation the clip gave it
  through the leg solve, as Unreal's foot placement writes it back: left to
  inherit the shin's turn it tipped its toe into the step below the height the
  push-out had checked. Together, on the staircase: floating planted feet 28.6%
  → 13.6% climbing, sunk 1.4% → 0%. **Matches.**
- **joint limits** — notapain clamps the knee as a hinge after everything else;
  the table exists here (`shared/lib/animation/jointLimits.ts`) and is not yet
  applied. **Divergence, open.**

Measured on the stand, world space, skeleton read directly:

- legs crossing (`verify:crossing`): ankles and knees never cross, walking or
  running. Before this session: ankles −17 cm walking, −26 cm running; knees
  −15 cm on a diagonal run.
- the passes still bring running feet closer than the clips do (ankles 7 cm
  against 15.5 cm at the start of a sideways or diagonal run; knees 12–18 cm
  against 20 cm). Not crossing, but not the clip either. **Open.**
- stairs (`verify:stairs`, 15 cm rise, 32 cm run): floating planted feet 13.6% of
  climbing frames (37.6% at the start of this work), none sunk; descending
  16.4% floating, p95 0.23 m. One descent case is
  open: a foot locked with its toe inside the riser is lifted whole by the
  push-out and held there until it unplants — 27 cm in the air.

Unused since the notapain port and due for removal: `systems/pelvisSolve.ts`
(Unreal's pelvis solver), `systems/ballPivot.ts`, parts of `rootOffset.ts` and
`footPlanting.ts`.

## Blending

GASP inertializes every transition through the `Inertialization` node.

Here `systems/inertialBlend.ts` is the same curve — David Bollo's quintic, which
starts at the offset the switch left behind carrying the velocity the pose
already had, and reaches zero with zero velocity and zero acceleration — and
`useInertialBlend` decays that offset per bone over the rig.

**Partial.** It runs on the gait switch, which is where the measured pop was: a
finger moved 60 degrees in one frame when the blend set changed outright. GASP
runs it on every transition, including the ones this system does not have yet
(starts, pivots, stance changes).

## Starts, stops, pivots

GASP distance-matches against baked distance curves
(`AnimDistanceMatchingLibrary.cpp:33` binary-searches the baked curve, `:222`
sets play rate to match speed) and has shot starts, stops and pivots.

Here the stop is matched, the start is not. Phase follows distance travelled, so
no baked curve is needed: `systems/stopMatching.ts` solves the friction model for
the distance the body still needs — above the stop speed the friction is
proportional to the speed, which makes the speed fall off linearly with distance;
below it the deceleration is constant — and scales the phase rate so the
remaining distance lands the cycle on a plant. Idle blends in by weight as the
body settles rather than cutting in at a threshold, so the last footfall stays
under the body: measured 0.317 m between the feet at rest, both planted.

**Starts and pivots are still missing**, and so is the shot vocabulary GASP has
for them.

## Root motion

GASP clips carry root motion and `OffsetRootBone` reconciles mesh and capsule.

Here every clip is in place, its true ground speed measured into
`assets/animations/clipGroundSpeeds.json`, and the capsule owns the motion while
phase follows the distance it covers. **Diverges by design**, and the design
only holds if it holds for every clip: one clip — the strafe — was never made
in place, carried 86 cm of its own travel, and slid the whole mesh off the
capsule whenever a turn pulled it into the blend. The converter now holds the
hips' X and Z at their first key for every clip, and `verify:clips` asserts it.

## Camera

GASP's camera is a spring arm on the actor, and the actor is drawn where it is
interpolated to be. Here the camera followed the raw simulation tick while the
mesh was drawn interpolated between ticks: each moved evenly on its own, but the
body against the camera jumped 3.61 times the median frame, which is the
ghosting that was visible. **Matches now** — the camera reads the same
interpolation the mesh does, and `verify:judder` holds the relative speed under
0.02 m/s, a threshold taken from the defect itself (0.048 broken, 0.005 fixed).

## Verification

GASP ships no automated animation checks.

Here:

- `npm run verify:limbs` walks the motion stand forward, backward, strafing and
  diagonal, 80 simulated frames each over a step, then stops it, and asserts the
  invariants a leg cannot violate on every frame of every drive: bone lengths,
  reach, knee range, no sinking through the floor, net drift while firmly held,
  double-support share, that a plant forms at all, that the chosen clip travels
  with the body, and that the body comes to rest on its feet. 72 checks, all
  passing. The knee's bend is measured against the line between the hip joints,
  not the body's facing: orientation warping turns the legs on purpose, and
  against the facing the clips alone read a knee 17 cm sideways. Mutation: a
  pole turned 90° fails 14 checks.
- `npm run verify:crossing` reads the two ankles and knees off the skeleton,
  across the line of the hip joints, over a course of direction changes walking
  and running, with the passes on and off: the legs never cross, and the passes
  bring them no closer than the clips do. 9 checks, 7 passing.
- `npm run verify:stairs` walks a real staircase against the course geometry
  itself, never the pass's own probe. 11 checks, 9 passing.
- the motion stand (`/labs/motion-stand`) steps one simulated frame at a time,
  renders on demand so the picture matches the numbers, and can switch the foot
  IK and the orientation warp off independently to isolate a pass.
- `npm run verify:clips` measures the assets themselves: drift across their own
  travel axis, vertical and yaw drift, the loop seam read from raw keyframes,
  toe-out, floor contact and gait symmetry. 54 checks.
- `npm run verify:spikes` steps the bench frame by frame and reports the second
  difference of every bone's rotation and position: pops, wherever they come
  from — a clip authored with a spike, a blend that switched without matching
  phase, a lock that let go all at once. 13 checks.
- `npm run verify:pelvis` measures where the body IS against the capsule that
  drives it, in world space: within a hand's width, no jumps, no creep. Every
  body-relative check before it was blind by construction to anything that moves
  the body whole. 25 checks.
- `npm run verify:judder` samples per rendered frame in the lab and asks how
  fast the body and the camera move apart. 5 checks.
- 265 unit tests over the pure systems.

**Beyond GASP**, and it is what found every defect above — including the ones
an earlier version of these checks could not see. Three of those checks used to
be tautologies: bone length measured against the length the same code computed,
reach measured against the clamp constant the same code applied, and a knee
"range" taken from an unsigned angle that reads a backwards knee as a good one.
A check that cannot fail is worse than no check, because it is counted.
