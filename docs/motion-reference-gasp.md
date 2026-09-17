# GASP, mapped

The Game Animation Sample at `E:/EpicVaultCache/GameAnimationSample_5.8`, read
for structure only — no asset, no animation and no data was copied out of it.
Produced by a dedicated reader; the counts and the markup claims below were
re-checked directly (see "verified" at the end).

## 1. What the set is made of

`Content/Characters/UEFN_Mannequin/Animations` holds **2345 assets**: ~1950
sequences (`M_`), 119 montages (`AM_`), 169 pose-search databases (`PSD_`), 33
schemas (`PSS_`), 24 interaction assets (`PSIA_`), 18 blend spaces, 14 choosers.

Locomotion alone is **1405 clips** — 60% of the whole set:

| Folder | Clips |
| --- | --- |
| Walk | 452 |
| Run | 457 |
| Crouch | 431 |
| Sprint | 65 |
| Jump | 145 |
| Traversal | 145 |
| Interactions | 187 |
| Idle | 48 |
| Ragdoll | 47 |
| AimOffset | 45 |
| Poses (leans) | 41 |
| Slide | 40 |
| MotionMatchingData | 199 |

## 2. The naming scheme is the coverage scheme

`M_<Stance>_<Gait>_<Type>_<FromDirection>_<ToDirection>_<PlantFoot>`

- **Two styles**, split almost exactly in half: `Neutral` and `Relaxed` (Walk
  224/228, Run 229/227, Crouch 213/218). The same movement, twice, in two moods.
- **Ten direction codes**: `F`, `B`, `FL`, `FR`, `BL`, `BR` plus `LL`, `LR`,
  `RL`, `RR` — the last four are strafes, encoding travel direction against body
  direction.
- **Every take exists twice**, `_Lfoot` and `_Rfoot`. Walk: 200 left-foot, 201
  right-foot. This is what guarantees phase continuity: whichever foot is down,
  there is a take that starts on it.

Take types, counted (Walk / Run / Crouch):

```
Box        64 / 64 / 64    direction change F ↔ strafe, orthogonal
Hourglass  64 / 63 / 63    diagonal ↔ opposite strafe
Start      54 / 52 / 52    from standing into all ten directions, both feet
Diamond    48 / 48 / 48    diagonal ↔ diagonal
Spin       36 / 35 / 34    180 and 360 turns through an axis
Stop       36 / 36 / 36    from all ten directions, both feet
Quad       32 / 32 / 32    diagonal ↔ cardinal
Pivot      28 / 28 / 28    180 on the spot
Loop       27 / 29 / 22    the cycles: ten directions, two styles, offset phases, slopes
Turn       24 / 24 / 32    45, 90, 135, 180 while moving, left and right, both feet
Reface     34 / 32 / 32    starts and stops where the body faces away from travel
Transition  8 /  8 /  4    run→walk, sprint→walk
Prism       8 /  8 /  8    small corrections, FL→F, F→FR
Arc         6 /  6 /  -    small, tight and wide arcs
Shuffle     6 /  4 /  4    re-planting the feet without travelling
Switch      4 /  4 /  4    changing which foot leads a strafe
```

Everything is mirrored again through `MDT_UEFN_Mannequin`, so the effective set
is roughly twice what is on disk.

## 3. Every clip carries generated markup

Float curves found in a locomotion take: `phase`, `movedata_speed`,
`enable_warping`, `contact_l`, `contact_r` (traversal adds
`distance_from_ledge`). Sync markers: `Footstep Left`, `Footstep Right`.

None of that is placed by hand. `Content/Blueprints/AnimModifiers` holds 18
modifiers that generate it:

- `AM_FootSteps_Walk` / `_Run` / `_Crouch` — detect contacts on `ball_l`/`ball_r`
  against `root` and emit **both** foley notifies and sync markers.
- `AM_BakePhaseCurveFromFootstepNotifies` — **bakes the `phase` curve from those
  footstep notifies.** This is the single curve every locomotion loop is matched
  on.
- `AM_MoveData_Speed` — extracts the clip's own root speed into
  `movedata_speed`.
- `AM_FootSpeed_L` / `_R` — per-foot speed curves.
- `AM_WarpingAlpha`, `AM_OrientationWarpingAlpha`, `AM_RateWarpingAlpha` — decide
  from root motion whether the take is going straight, and write the alphas that
  gate warping.
- `AM_DistanceFromLedge` — the distance curve traversal is matched on.
- `AM_Copy_IKFootRoot`, `AM_Reset_Attach`, curve utilities.

## 4. One database per situation, four levels of density

161 `PoseSearchDatabase` assets, grouped:

- `Relaxed` — 89. The finest cut: a database per situation per direction, e.g.
  `PSD_Relaxed_Stand_Walk_F_Loops`, `..._Starts`, `..._Pivots`, `..._Spins`,
  `..._Stops`, `..._F_Turns`, `..._F_GaitTransitions`, plus sprint, crouch, idle,
  jumps, slides and their exits.
- `Dense` — 35. Same situations, no direction split.
- `Sparse` — 16, `Extreme_Sparse` — 17. Loops and starts, stops only for run.
- Four specials: ragdoll, traversal, and two run databases.

They are LOD levels of one set, selected by `DDCvar.MMDatabaseLOD` through
`CHT_PoseSearchDatabases`. The second reason for the split matters more: **one
database is one situation**, so the search cannot answer a stop where a start is
needed.

## 5. The schemas are small, and loops do not compare the pose at all

34 schemas, all on `SK_UEFN_Mannequin`, all with a mirror table. The bone sets
are tiny — `pelvis`, `foot_l`, `foot_r`, occasionally `spine_05` and the hands.

| Schema | Channels | Bones |
| --- | --- | --- |
| `PSS_Default` | Position, Velocity, Heading (Y), Trajectory, feet vertical velocity | pelvis, foot_l, foot_r |
| `PSS_Relaxed_Loops` | **Curve(`Phase`)**, Heading, Trajectory | pelvis |
| `PSS_Relaxed_Starts` / `_Stops` / `_Pivots` / `_SprintPivots` / `_WalkSpins` / `_RunSpins` / `_StandTurn` | Position, Velocity, Trajectory, feet vertical velocity | foot_l, foot_r |
| `PSS_Idle`, `PSS_Relaxed_Idle` | Pose (sampled bones), Position, Velocity, Trajectory | pelvis, spine_05, feet |
| `PSS_Relaxed_Slide` / `_SlideExit` | Position, Velocity, Trajectory | root, pelvis, feet, hand_r |
| `PSS_Traversal` | Position, Velocity, Trajectory + custom blueprint channels | feet |
| `PSS_Interaction_Tackle` / `_Takedown` | Position, Pose, a wedge filter, attacker/victim roles | root |

The line worth stopping at: **for locomotion loops the schema is a phase curve
plus a trajectory.** The pose is not compared. Phase continuity is guaranteed by
the data — every take exists on both feet — and the search only has to agree
about where the cycle is and where the body is going.

## 6. The database is chosen by a table, not by code

`CHT_PoseSearchDatabases_Relaxed` is a decision table with ~17 inputs:
movement mode and its value last frame, movement state, stance, gait and gait
last frame, movement direction and recent direction, 2D speed, and seven
situation booleans — `IsStarting`, `IsPivoting`, `ShouldTurnInPlace`,
`ShouldSpinTransition`, `JustLanded_Light`, `JustLanded_Heavy`, `JustTraversed`.
Rows are grouped into nested choosers per situation, and the output carries
`UseMM`, `MMCostLimit`, `StartTime`, `BlendTime`, `BlendProfile` and tags.

So: a deterministic table narrows to one situation, motion matching searches
inside it by cost, and warping plus IK removes what is left.

## 7. The graph nodes, and the two paths

Both animation blueprints use: `MotionMatching`, `PoseSearchHistoryCollector`,
`BlendStack` (with a stitch database, stitch blend time and a max cost),
`OffsetRootBone`, `Steering`, `OrientationWarping`, `LegIK`, `Inertialization`,
`DeadBlending`. The CMC path adds the native `FootPlacement` node; the Mover
path adds `StrideWarping` and a `CR_Biped_FootPlacement` control rig, chosen by
`DDCvar.FootPlacementMode` (0 off, 1 node, 2 control rig).

Parameters that name the mechanisms: `TrajectoryGenerationData_Idle` and
`_Moving`, `TrajectoryHistoryCount`, `TrajectoryPredictionCount`,
`TrajectorySpeedMultiplier`, `TrajectoryCollision`, `Phase_History`,
`Enable_Warping`, `Enable_TurnInPlaceSteering`, `Enable Slope Warping`,
`Enable Foot Pinning`, `FootContactLockThreshold`, `StrafeOffset_*`,
`LeanAmount`, `RootDamperSmoothingTime`, `RootMotionAngleThreshold`.

Config: `FixedTickFrameRate=60`, physics substepping at 1/60 with up to 16
substeps, `PoseSearchSettings.AvailabilitiesBufferSize=230`.

## 8. What this means for a project with a dozen clips

GASP spends ~1950 takes so that the procedural layer only ever corrects a few
percent of error. With four indexed clips the ratio inverts: everything GASP
covers by footage has to be computed. In priority order:

1. **Phase is computed, not searched.** Their `phase` is a baked curve on 1400
   clips. Here it must be one continuous oscillator that every contact derives
   from, and a clip may only be switched on a matching phase.
2. **Orientation warping over the full range.** They shot ten directions and
   warp ±30–45°; with one forward loop the warp must cover ±180° distributed
   across pelvis and spine, with counter-rotation, or the body slides sideways
   while facing forward.
3. **Stride length normalized by the clip's own speed** — their `movedata_speed`
   equivalent, which the Blender bake already measures here.
4. **Starts, stops and pivots by distance matching**, not by clip: 54 starts, 36
   stops and 28 pivots per gait is not a set we will have. The substitute is a
   travelled-distance curve, phase braking, and a synthetic plant at the stop
   point.
5. **Turn in place and reface procedurally** — 32 reface takes per gait exist
   precisely because body and travel disagree; that has to be warping here.
6. **Foot placement is not cosmetic here.** In GASP it tidies correct data; with
   a small set it is the only thing holding contact: a trace per foot, a lock
   while planted (`Enable Foot Pinning`, `FootContactLockThreshold`), pelvis
   compensation, slope warping.
7. **Leans, landings and aim as additives** computed from acceleration and
   vertical speed — they have 41 lean poses and 45 aim-offset poses.
8. **Separate the capsule from the mesh** — `OffsetRootBone` plus `Steering`.
   Without a thousand clips the mesh cannot follow the capsule directly without
   visible sliding.
9. **Keep the situation table anyway.** Even with a dozen clips, an explicit
   table from state to *procedural mode* is worth having; otherwise the logic
   spreads through a state machine and stops being debuggable.

## 9. Verified directly

Re-checked against the files rather than taken on trust: the database count
(161), the locomotion clip counts (Walk 452, Run 457, Crouch 431, Sprint 65),
the existence of `AM_BakePhaseCurveFromFootstepNotifies`, `AM_MoveData_Speed`
and the footstep modifiers, and the curve names inside
`M_Relaxed_Walk_Loop_F` — `phase`, `movedata_speed`, `contact_l`, `contact_r`,
`enable_warping`.
