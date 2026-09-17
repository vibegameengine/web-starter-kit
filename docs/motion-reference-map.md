# Reference map: how the sources solve locomotion

Three sources, read for mechanism only — nothing is copied from any of them:

- **Unreal 5.8** at `C:/GameEngien/UE_5.8`
- **Game Animation Sample (GASP)** at `E:/EpicVaultCache/GameAnimationSample_5.8` — ideas only, no animation taken
- **notapain**, a Godot project of ours, at `C:/Users/pavel/projects/AIGamess/notapain`

Sections 1–3 are what was read directly. Section 4 is the gap against
`src/features/motion`. Full function-level maps of all three sources are being
produced by dedicated readers and land in sections 5–7.

## 1. notapain — the procedural layer, function by function

The chain is built in `entities/character/character_rig.gd:71` `_build_foot_chain`
and runs in scene-tree order, all after the animation mixer:

```
Skeleton3D
  ├─ FootIKPrep          reads the PURE mixer pose, writes foot and pole targets, drops the pelvis
  ├─ TwoBoneIK3D         solves both legs to those targets, knees toward the poles
  ├─ FootRotate          tilts each planted foot onto the surface normal
  ├─ LookAtModifier3D    head aim, influence 0.5
  └─ JointLimits         clamps knees and elbows into anatomical range — LAST, so it judges clips AND IK
```

| Mechanism | Where | What it does |
| --- | --- | --- |
| Contact weight, stance foot | `foot_ik_prep.gd:158` | `contact = 1 - smoothstep(max_step_drop, max_step_drop + 0.3, max(gap - ankleHeight, 0))` — a stance foot keeps full weight across a big step so the BODY drops to reach it |
| Contact weight, swing foot | `foot_ik_prep.gd:161` | `contact = 1 - smoothstep(ankleHeight + plant_margin, ankleHeight + swing_margin, gap)` — a lifted foot fades out and keeps its animated motion |
| Contact smoothing | `foot_ik_prep.gd:163` | `lerp` toward the new contact at `contact_adapt = 16` per second |
| Terrain correction in Y only | `foot_ik_prep.gd:170-174` | Only a Y offset is corrected, smoothed at `corr_adapt = 10`; XZ follows the clip exactly, so on flat ground the layer is a no-op |
| Stride warp | `foot_ik_prep.gd:177-184` | Fore-aft distance from the pelvis is scaled by the animator's stride factor; lateral offset untouched |
| Foot lock by stance phase | `foot_ik_prep.gd:186-203` | Rising edge of the stance window locks the foot's world XZ; the hold fades by `1 - smoothstep(max_hold/2, max_hold, gap)` and eases with `move_toward` at `plant_blend_rate = 9` |
| Pelvis drop | `foot_ik_prep.gd:213-218` | Lowers the hips by the deepest planted-foot drop, smoothed at `hip_drop_adapt = 7`, clamped to `max_step_drop = 0.55`; zero on flat ground |
| Knee pole | `foot_ik_prep.gd:209` | Pole placed `pole_dist = 0.8` in front of the knee, so the knee bends forward |
| Foot past an edge | `foot_ik_prep.gd:127-137`, `_pull_to_ground:270` | A stance foot with no ground within `max_step_drop` is pulled horizontally toward the body in six steps until ground reappears — it plants on the edge instead of floating, and the body is not dropped off the cliff |
| Foot rotation | `foot_rotate.gd:26-45` | `tilt = Quaternion(up, surfaceNormal)`, applied to the solved foot and slerped by the contact weight; runs AFTER the IK, and only on a planted foot |
| Joint limits | `joint_limits.gd:56-101` | Swing-twist split about the measured hinge axis: knee flexion clamped to −5°…155°, off-axis swing squeezed into an 8° cone. Near no-op on a valid pose |
| Cadence versus stride | `character_animator.gd:144-150` | `ratio = planarSpeed / authoredSpeed`, `rate = clamp(sqrt(ratio), 0.85, 1.6)`, `stride = clamp(ratio / rate, 0.7, 1.9)` — speed is split between cadence and stride length instead of all going into play rate |
| Authored clip speed | `character_animator.gd:645` | Median of the stance foot's backward speed, sampled 64 times, contact threshold at 35% of the foot's height range |
| Stance windows | `character_animator.gd:682` | Foot height sampled 64 times; threshold `lo + 0.30 × range`; the longest contiguous run over a DOUBLED array (so a window that wraps the cycle is found); returned normalized per foot |
| Stance lookup at runtime | `character_animator.gd:440` `is_foot_stance` | Reads the cycle phase, picks the window by blend position: backward window when reversing, walk window under 0.45, walk→run lerp above it, and everything counts as stance under 0.15 (standing) |
| Root stripping | `character_animator.gd:633` | The hips position track is flattened to its first key in XZ, optionally in Y — the clip stops carrying travel, the controller owns it |
| Crossfade | `anim_blend.gd` | Two slots plus a base mix, pure maths, `move_toward` per second, unit-tested frame by frame |
| State machine | `anim_state_machine.gd` | Six states, transitions guarded by class (air, climb), each returns whether it actually changed — pure, no engine nodes |

Their own doctrine, from `docs/game-design/movement-controller/testing-and-debugging.md`:
pull the logic out of the engine's graph into pure code, test it on numbers, and
when the bug is in the engine layer build a deterministic stand that prints what
happens frame by frame.

## 2. Unreal — what was read directly

| Mechanism | Source | Formula or rule |
| --- | --- | --- |
| Movement entry | `CharacterMovementComponent.cpp:2772` | One `PerformMovement`, sub-stepped by `MaxSimulationTimeStep`, dispatching to the mode |
| Walking | same, `:5653` | `MoveAlongFloor` then `StepUp` — a step, a wall and a slope are one path |
| Stride scale | `AnimNode_StrideWarping.cpp:209` | `strideScale = locomotionSpeed / rootMotionSpeed`, clamped and interpolated |
| Warped foot target | same, `:233-247` | Project the thigh onto the floor plane through the foot along gravity → plane origin; project the foot onto the plane whose normal is the stride direction → scale origin; `warped = origin + (foot - origin) × strideScale` |
| Pelvis after warping | same, `:288` | A solver lowers the pelvis so a stretched stride cannot straighten the leg |
| Distance matching | `AnimDistanceMatchingLibrary.cpp:33` | Binary search over a baked distance curve: distance → time |
| Play-rate matching | same, `:222` | `rate = wantedSpeed / (rootMotionDistance / clipLength)` |
| Pose cost | `PoseSearchIndex.cpp:8` | Weighted squared difference per dimension, square-rooted |
| GASP feature set | schema `PSS_Default` | Bones pelvis, foot_l, foot_r through Position and Velocity channels, plus a Trajectory of positions and headings |

## 3. GASP — what was read directly

- `Content/Characters/UEFN_Mannequin/Animations` holds **2345** animation assets,
  split into folders by intent: Walk, Run, Sprint, Crouch, Idle, Jump, Slide,
  Traversal, AimOffset, Poses, Avoidance, LookAtPOI, Interactions, Ragdoll.
- Motion matching data is not one database but several — `CHT_PoseSearchDatabases`
  plus `_Dense`, `_Sparse`, `_ExtremeSparse`, `_Relaxed`, `_Mover` — and a schema
  per situation: `PSS_Default`, `PSS_Idle`, `PSS_Stop`, `PSS_Jump`,
  `PSS_Traversal`, `PSS_Relaxed_Starts`, `PSS_Relaxed_Stops`,
  `PSS_Relaxed_Pivots`, `PSS_Relaxed_StandTurn`, and more.
- Which database is used is chosen by data, not code: `S_ChooserOutputs`,
  `S_TraversalChooserInputs`, `PSS_Traversal_Chooser` under `Blueprints/Data`.

The consequence for this kit, stated plainly: with four indexed clips against
their thousands, the quality cannot come from the database. It has to come from
the procedural layer — which is what section 1 is a map of.

## 4. The gap, mechanism by mechanism

| Mechanism | `src/features/motion` today |
| --- | --- |
| Swept trace, slide, step up, snap to ground | present — `boxTrace.ts`, `slideMove.ts` |
| Acceleration, friction, jump edge | present — `motionVelocity.ts` |
| Turn with momentum, spine twist | present — `turnDynamics.ts` |
| Orientation warping | present — `orientationWarp.ts` |
| Stride warping | present — `strideWarp.ts`, but the stride scale takes the whole speed ratio |
| Cadence/stride split | **missing** — the play rate takes the entire ratio, so a faster walk is a sped-up recording rather than a longer step |
| Contact weight per foot | **missing** — the leg pass corrects unconditionally |
| Stance windows measured from the clip | **missing** — nothing knows when a foot is supposed to be planted |
| Foot lock in world space | **missing** — this is the anti-skating mechanism |
| Soft release of the lock | **missing** |
| Terrain correction in Y only, smoothed | partial — grounding exists, smoothing and the flat-ground no-op do not |
| Pelvis drop, smoothed and clamped | partial — computed, not smoothed, not clamped to a step |
| Foot past an edge pulled inward | **missing** |
| Foot rotation onto the surface normal | **missing** |
| Knee pole direction | **missing** — the solver takes whatever bend it finds |
| Joint limits | **missing** — nothing stops the IK bending a knee backwards |
| Head aim | **missing** |
| Motion matching search and database | present — `poseSearch.ts`, four clips indexed |
| Inertial blending | partial — a plain crossfade, not an inertial blend |
| Starts and stops | **missing**, and the clip set has none |
| Deterministic frame stand | **missing** — there is no surface that steps the animation by an exact delta and prints bone positions |
