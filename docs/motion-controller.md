# Motion controller and animation system

What Unreal does, what this kit does, and every number that was measured rather
than chosen. Written because the rationale may not live in the code: comments
are banned here, so this file is where the reasoning belongs.

The engine source read for this is Unreal 5.8 at `C:/GameEngien/UE_5.8`, and the
sample project that stands on it is the Game Animation Sample at
`E:/EpicVaultCache/GameAnimationSample_5.8`. **Nothing is copied from either** —
no code, no animation. What transfers is the mechanism.

## 1. How Unreal solves movement

| Mechanism | Engine source | What it actually does |
| --- | --- | --- |
| One movement entry point | `Runtime/Engine/Private/Components/CharacterMovementComponent.cpp:2772` `PerformMovement` | Splits the frame into sub-steps bounded by `MaxSimulationTimeStep`, then dispatches to the mode |
| Movement modes | same file, `PhysWalking:5653`, `PhysFalling:4887`, `PhysFlying:4429`, `PhysSwimming:4605`, `PhysNavWalking:5892` | Each mode owns its own gravity, floor handling and velocity rules |
| Acceleration and braking | `CalcVelocity:3863`, `ApplyVelocityBraking:4377` | Friction and braking deceleration are separate numbers; braking is sharper than acceleration |
| Stepping up | `StepUp:7561`, `MoveAlongFloor:5552` | A step, a wall and a slope are one code path: lift by the step height, run the same slide, push back down |
| Rotation | `PhysicsRotation:6630` | Either orient to movement or follow the controller's desired rotation |

## 2. How Unreal makes the animation fit that movement

| Mechanism | Engine source | What it actually does |
| --- | --- | --- |
| Stride warping | `Plugins/Animation/AnimationWarping/Source/Runtime/Private/BoneControllers/AnimNode_StrideWarping.cpp:209` | `strideScale = locomotionSpeed / rootMotionSpeed`, clamped and interpolated |
| …and how it moves the feet | same file, `:233-247` | The foot target is scaled about the point under the hip, along the stride direction only |
| …and the pelvis | same file, `:288` | Lowered by a solver so a stretched stride cannot straighten the leg |
| Distance matching | `Plugins/Animation/AnimationLocomotionLibrary/Source/Runtime/Private/AnimDistanceMatchingLibrary.cpp:33` | A distance curve is baked into the clip; the frame is found from distance travelled by binary search |
| Play rate matching | same file, `:222` `SetPlayrateToMatchSpeed` | For loops: rate = wanted speed ÷ (root motion distance ÷ clip length) |
| Motion matching cost | `Plugins/Animation/PoseSearch/Source/Runtime/Private/PoseSearchIndex.cpp:8` | Weighted squared distance between the query and each indexed pose |
| Motion matching features | GASP schema `PSS_Default` | Bones pelvis, foot_l, foot_r through Position and Velocity channels, plus a Trajectory of positions and headings |

The load-bearing idea, and the one that took the longest to see: **Unreal does not
drive a cyclic walk by its phase.** It plays the clip at a rate that matches the
body's speed and then warps the stride so the feet land where the ground is.
Distance matching is for starts, stops and anything with a target.

## 3. What this kit has

Pure systems, each unit-tested, under `src/features/motion/systems`:

| File | Role |
| --- | --- |
| `boxTrace.ts` | Swept AABB trace plus the `TraceBox` contract every solver takes as an argument |
| `slideMove.ts` | Slide along planes and creases, step up through the same slide, snap to ground |
| `motionVelocity.ts` | Friction, acceleration toward the wish direction, the jump edge |
| `motionProfile.ts` | The tunables, and `profileAtSpeed` which keeps stop speed below top speed |
| `turnDynamics.ts` | A turn with momentum, bounded by what its brakes can shed; the spine twist |
| `strideWarp.ts` | Stride scale, the warped foot target, pelvis drop, grounding |
| `orientationWarp.ts` | Pelvis toward travel, spine counter-rotated — a turn with no turn clip |
| `locomotionBlend.ts`, `locomotionPose.ts` | Gait weights and the clip/weight/frame decision for the blend animator |
| `poseSearch.ts` | The motion matching cost, the search, and the penalty that protects the playing pose |
| `trajectoryPrediction.ts` | Future root positions and headings from velocity and intent |
| `motionMatchQuery.ts` | Assembles the query vector in the same layout the database uses |

React components attach those to a body (`components/`), entities compose them
(`entities/`), and the DEV lab at `/labs/motion-lab` is where they are judged.

## 4. The automation, and what each tool measures

| Command | What it does |
| --- | --- |
| `node scripts/convert-animations.mjs` | FBX → GLB with three in plain Node, renames the clip inside the file, prints duration, hips travel and implied speed |
| `node scripts/measure-animations.mjs` | Plays each GLB through a mixer and measures stride and contact share from the feet |
| `node scripts/measure-ground-speeds.mjs` | Drives Blender per clip; writes `clipGroundSpeeds.json` |
| `blender -b -P scripts/blender-bake-root-motion.py -- <fbx> <glb>` | Bakes root motion at the measured speed **and proves the speed**: it re-measures how far the planted foot still slides, and corrects until that residue is gone |
| `node scripts/build-pose-database.mjs` | Samples the rooted clips into the pose database used by motion matching |

## 5. Numbers that were measured

Ground speed, from the self-correcting Blender bake. A residue of zero means the
planted foot no longer moves in world space:

| clip | ground speed, m/s | slip left, m/s |
| --- | --- | --- |
| walk-forward | 1.012 | 0.0000 |
| walk-backward | 0.644 | 0.0085 |
| run-forward | 2.693 | 0.0000 |
| run-backward | 2.373 | 0.0000 |

The strafe clip is deliberately absent: a sideways gait cancels in that
estimator, and a number that cannot be trusted is worse than no number.

Two earlier measurements were wrong and are recorded here so they are not
repeated:

- **Implied speed from foot magnitudes.** Averaging the magnitude of per-frame
  foot velocity gave the walk 1.568 m/s against a true 1.012. Magnitudes cannot
  cancel, so noise can only push the number up. The body ran 55% faster than its
  own stride for as long as that number was believed.
- **Foot skate as a per-frame median.** With a 120 fps render over a 60 Hz tick,
  half the frames hold the previous pose, so the median of per-frame foot
  displacement is dominated by frames where the foot travels with the body. It
  reported the feet sliding at exactly body speed. Measured over whole contact
  intervals instead, the slip is a small fraction of the body's travel.

## 6. What is not done

- Motion matching picks the wrong clip: walking forward selects `run-backward`.
  The database builds its frame from the hips bone yaw while the query uses the
  body facing, and on a Mixamo rig those differ by a fixed offset.
- No starts and no stops: the clip set has none, and a start is what makes the
  first step read as weight rather than a slide.
- Foot placement is grounding and stride warping only. There is no planted-foot
  lock, no foot rotation onto the surface normal, and no contact hysteresis.
- The strafe clips have no verified ground speed.
- The upper body is inert: no lean into acceleration, no aim offset, no head
  look.
