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
| choice of database | chooser table on ~17 inputs picks ONE of 161 databases | none — the gait comes from the search result, the direction from a blend space |
| choice of clip | pose search inside that database | angular blend of the nearest two directional clips |
| choice of frame | pose search returns clip AND time | phase from distance travelled; the search never moves the playhead |

**Diverges, structurally.** GASP narrows the search space with a chooser
(stance, gait, movement state, direction, LOD) and only then compares poses.
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
(`:706`) asks for near-ground AND slow, `DeterminePlantType` (`:601`) applies a
two-radius hysteresis, `GetAlignmentAlpha` (`:727`) fades by foot speed,
`FindPelvisOffsetRangeForLimb` (`:280`) and `SolvePelvis` (`:1911`) solve the
pelvis against sphere-line intersections per Rune Johansen's thesis, and
`UpdatePlantOffsetInterpolation` (`:473`) springs the unplant offset.

Here, after this session's rewrite, the rules are **notapain's**, not UE's:

- contact comes from the stance window and the gap to the ground, never from a
  measured foot speed (`footContactWeight`). A stance foot holds full contact
  until its ground is further than the leg can reach; a swing foot fades out by
  height.
- the lock takes hold at once on the rising edge of stance, at the point the
  clip itself put the foot, and only the release is rate limited.
- release is by drift: `1 - smoothstep(max_hold/2, max_hold, drift)` with
  `max_hold = 0.9`.
- a stance foot past an edge is pulled horizontally toward the body until ground
  within one step appears (`systems/footGround.ts`), instead of reaching down
  into the pit.
- the target is clamped inside the leg span before the solver sees it.
- the knee pole sits in front of the knee along **body forward**, not along the
  travel direction.
- the pelvis drops by the deepest planted surface delta.

**Diverges from UE deliberately.** UE's speed-based plant is exactly what broke
here: foot speed read over render frames goes to zero between simulation ticks,
so at 144 fps against a 60 Hz tick both feet reported full contact and the
solver hauled both legs at once. That is the mangled-legs picture. The stance
window is frame-rate independent by construction.

A plant is also released when the body turns further than the hip can twist, or
when the lock leaves nine tenths of the leg span, and the release runs the hold
down at a rate rather than cutting it — an outright cut snapped the foot half a
metre. The twist limit comes from the ragdoll's own measured joint table, now
shared at `shared/lib/animation/jointLimits.ts` so both sides read the same
degrees.

Still missing against UE: the per-limb pelvis offset range with `HeelLiftRatio`,
and the spring interpolation of the unplant offset.

## Blending

GASP inertializes every transition. Here it is a weighted crossfade at a shared
phase. **Diverges; an inertialization stack is pending.**

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

Here the clips are In Place, their true ground speed measured per clip into
`assets/animations/clipGroundSpeeds.json`, and the capsule owns the motion while
phase follows distance travelled. **Diverges.**

## Verification

GASP ships no automated animation checks.

Here:

- `npm run verify:limbs` walks the motion stand forward, backward, strafing and
  diagonal, 80 simulated frames each over a step, then stops it, and asserts the
  invariants a leg cannot violate on every frame of every drive: bone lengths,
  reach, knee range, no sinking through the floor, net drift while firmly held,
  double-support share, that a plant forms at all, that the chosen clip travels
  with the body, and that the body comes to rest on its feet. 45 checks.
  Current reading: worst drift while held 5.9 mm, stride warp 1.000 in every
  direction.
- the motion stand (`/labs/motion-stand`) steps one simulated frame at a time,
  renders on demand so the picture matches the numbers, and can switch the foot
  IK and the orientation warp off independently to isolate a pass.
- 154 unit tests over the pure systems.

**Beyond GASP**, and it is what found every defect above.
