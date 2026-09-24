# GASP and Unreal: movement and transitions, as they are built

The reference for rebuilding the motion system from scratch. It records what GASP and Unreal
Engine 5.8 actually do, with the values they actually use, and where each fact came from.
It is the starting point, not the target: the aim is to be first inspired by this, then better.

## Sources, and how each fact was obtained

- **Engine source.** `C:/GameEngien/UE_5.8`, read directly. Every algorithm below cites its file
  and function.
- **GASP's own values.** Game Animation Sample 5.8, copied from the vault cache to
  `E:/Projects/GameAnimationSample_5.8` and opened in the 5.8 editor (module BuildId 55116800
  matches the engine). The editor's own Python reads the assets:
  - `scripts/gasp/dump_gasp.py` — the generic property walk;
  - `scripts/gasp/dump_gasp_deep.py` — Blueprint variables by name.

  Output is in the project's `Saved/gasp_dump/*.json`. Numbers quoted from there are marked
  **(asset)**.
- **GASP measured while it plays.** `scripts/gasp/measure_gasp_pie.py` runs Play-in-Editor in a
  visible editor and drives the character by input. Each frame it records the camera against
  the character, the speed and the facing, and screenshots the named moments. Numbers from
  there are marked **(measured)**.
- **Names only.** `scripts/gasp-names.mjs` / `gasp-scan.mjs` list what an asset contains when
  its values cannot be read. Facts from there are marked **(named)**.

### Running the tools

The dumps run headless in the commandlet; they read data and draw nothing:

```
UnrealEditor-Cmd.exe GameAnimationSample.uproject -run=pythonscript -script=scripts/gasp/dump_gasp.py -unattended -nullrhi -nosplash
UnrealEditor-Cmd.exe GameAnimationSample.uproject -run=pythonscript -script=scripts/gasp/dump_gasp_deep.py -unattended -nullrhi -nosplash
```

- `dump_gasp_deep.py` exists because `dir()` on a Blueprint's default object does not list
  Blueprint variables (`WalkSpeeds`, `RunSpeeds`…), so they are read by name. Camera rigs keep
  their settings in a tree of node objects inside the rig's package; the walk follows those.

The measurement needs a visible editor and a running game:

```
UnrealEditor.exe GameAnimationSample.uproject /Game/Levels/DefaultLevel -ExecCmds="py scripts/gasp/measure_gasp_pie.py" -nosplash
```

- Not `-ExecutePythonScript`: that runs the script and closes the editor at once, before a
  single frame of Play-in-Editor.
- Input goes in through Enhanced Input's debug commands `Input.+action IA_Move X=… Y=…` and
  `Input.-action`, the way a held stick would. GASP ignores `AddMovementInput` for its gait and
  speed, and the Enhanced Input subsystem is not reachable from the editor's Python
  (`unreal.SubsystemBlueprintLibrary` does not exist there).
- With C: full, the Zen DDC answers "Insufficient Storage 507" and every run recompiles
  shaders. Point the cache elsewhere: `UE-LocalDataCachePath=E:\UEDDC` and
  `-ddc=InstalledNoZenLocalFallback`.
- Output: `<project>/Saved/gasp_measure/frames.json` and the screenshots; then
  `node scripts/gasp/analyse_gasp_frames.mjs [frames.json]` prints the curves quoted below.

What could not be read: the settings of anim graph nodes (the graph's `Nodes` are protected
from Python) and the internals of the Gameplay Camera rigs. For those, this document gives the
engine defaults and what the running game measures, never a guess.

## The character

| | GASP | source |
|---|---|---|
| capsule | half height 86 cm, radius 30 cm; mesh at z −88, yaw −90 | (asset) `SandboxCharacter_CMC` |
| walk speeds, forward / strafe / backward | 200 / 180 / 150 cm/s | (asset) `WalkSpeeds` |
| run speeds | 500 / 350 / 300 cm/s | (asset) `RunSpeeds` |
| sprint speeds | 700 / 700 / 700 cm/s | (asset) `SprintSpeeds` |
| crouch speeds | 225 / 200 / 180 cm/s | (asset) `CrouchSpeeds` |
| default gait | Run | (asset) `Gait` |
| direction → speed blend | `Curve_StrafeSpeedMap` over the angle between facing and travel | (asset) |
| max acceleration | 500 cm/s² (base; `CalculateMaxAcceleration` may override at runtime) | (asset) CMC |
| braking deceleration walking | 500 cm/s² | (asset) CMC |
| ground friction | 8; braking uses the same (no separate braking friction) | (asset) CMC |
| rotation | 360°/s yaw, from the controller's desired rotation, not "orient to movement" | (asset) CMC |
| jump | 500 cm/s up, gravity scale 1, air control 0.25 (boost ×2) | (asset) CMC |
| steps | max step height 45 cm; perch radius threshold 20 cm, perch additional height 40 cm | (asset) CMC |
| min analog walk speed | 150 cm/s | (asset) CMC |

**How speed depends on direction.** `CalculateMaxSpeed` (named) takes the gait's speed vector
and reads `Curve_StrafeSpeedMap` at the travel angle. The curve returns an index (asset,
sampled):

| angle | 0°–45° | 60° | 75° | 90° | 105° | 120° | 135°–180° |
|---|---|---|---|---|---|---|---|
| index | 0 (forward) | 0.43 | 0.86 | 1 (strafe) | 1.14 | 1.57 | 2 (backward) |

So forward speed holds out to 45° off the facing, blends to strafe by 90°, and to backward by
135°. This system instead multiplies one speed by a strafe or backward share
(`DIRECTION_SPEED_SHARES`).

### How the Character Movement Component moves the body

`UCharacterMovementComponent::CalcVelocity`, `CharacterMovementComponent.cpp`:

- **No input, or faster than allowed:** braking. `ApplyVelocityBraking` applies
  `Friction × velocity` plus a constant `BrakingDeceleration` against the motion, in sub-steps.
  When over speed but still pushing forward, the speed is held at the limit rather than braked
  under it.
- **With input:** turning friction first. `V = V − (V − dir(A) × |V|) × min(dt × Friction, 1)`
  turns the velocity toward the input while keeping its speed. Then `V += A × dt`, clamped to
  the input's max speed. The turn is a friction-rate bend of the velocity vector, not an
  acceleration along the wish direction.

This system's `motionVelocity.ts` is Quake-style: it accelerates along the wish direction only
and applies ground friction always. A turn at speed therefore behaves differently — it sheds
speed instead of bending the velocity.

## Motion matching

`UPoseSearchLibrary::UpdateMotionMatchingState`, `PoseSearchLibrary.cpp:819`:

- **Search throttling.** A search runs when the continuing pose cannot advance, or once
  `SearchThrottleTime` has passed since the last. Otherwise the continuing pose simply advances.
- **The continuing pose competes.** When not force-interrupted, the database first scores the
  pose already playing (`SearchContinuingPose`), then every database is searched, and the best
  result wins. Staying on the same clip is a candidate like any other, biased by the database's
  continuing-pose cost.
- **`PoseJumpThresholdTime`** excludes poses within that interval of the current one in the
  same clip, so the search cannot hop a few frames along the clip it is already playing.
- **`PoseReselectHistory`** (default 0.3 s) keeps a history of recently selected poses and
  excludes them, so the search does not ping-pong between two poses.
- **Play rate.** `CalculateWantedPlayRate` (`:434`) scales the play rate so the clip's speed
  matches the trajectory's, clamped to the `PlayRate` interval. With a `PoseSearchEvent` it
  instead times the clip to arrive at the event.

Node defaults (`AnimNode_MotionMatching.h`): `BlendTime` 0.2 s, linear, `PoseReselectHistory`
0.3 s, `SearchThrottleTime` 0, `PlayRate` [1, 1], `bUseInertialBlend` false.

GASP (named):
- 161 pose-search databases in 4 LOD groups, with 34 schemas;
- a chooser table narrows them by stance, gait, movement state, direction and LOD before any
  pose is compared;
- the looping schema `PSS_Relaxed_Loops` compares phase, heading and trajectory only, no pose.

## The trajectory

`UPoseSearchTrajectoryLibrary`, `PoseSearchTrajectoryLibrary.cpp`:
- **History** is recorded from the actor's transforms.
- **The future** is a forward simulation of the movement component
  (`UpdatePrediction_SimulateCharacterMovement`, `:474`): the same friction, braking and
  acceleration as `CalcVelocity`, clamped to the max speed, for `NumPredictionSamples` steps of
  `SecondsPerPredictionSample`.
- **Facing** in the prediction turns toward the acceleration at `RotateTowardsMovementSpeed`
  (default 10), and the controller's yaw rate is followed up to `MaxControllerYawRate`
  (default 70).
- **Optional curves** remap speed and acceleration before prediction.

Because the prediction runs the same physics as the body, the search sees the stop, the start
and the turn before they happen. That is how GASP picks a stop clip that lands where the body
will stop.

## Transitions

### The blend stack

`AnimNode_BlendStack.h`:
- a new request pushes a player on a stack that blends over its own `BlendTime` and blend
  profile (per-bone timing);
- up to `MaxActiveBlends` players (default 4) run at once;
- when more are requested, the overflow is blended into a stored pose (`bStoreBlendedPose`)
  rather than dropped, which would pop;
- `MaxBlendInTimeToOverrideAnimation` lets a request replace one that has only just started;
- `PlayerDepthBlendInTimeMultiplier` speeds up blends deeper in the stack.

GASP uses the blend stack in both animation blueprints (named).

### Inertialization

`AnimNode_Inertialization`, David Bollo's quintic. The switch leaves an offset between the old
and new pose; that offset is decayed to zero with zero velocity and acceleration at the end.
Cheap and smooth for small differences. With large offsets the initial velocity has to be
clamped (it is), or the curve overshoots.

### Dead blending

`AnimNode_DeadBlending.cpp`, Daniel Holden's method, in both GASP blueprints (named). At a
transition the **old pose is kept alive**:

- every bone is extrapolated from its last velocity, and that velocity decays exponentially:
  `x(t) = x0 + v/c × (1 − e^(−c t))`, with `c = ln 2 / halflife`;
- the new pose is cross-faded in over the blend duration (default 0.25 s).

The decay half-life is chosen per axis, from the ratio of the gap still to cover to the
velocity:
- `halflife × (gap / velocity)`, clamped to [0.05, 1] s by default (`:227`);
- a bone already moving toward the new pose keeps moving a long time;
- a bone moving away is stopped quickly.

Extrapolation is capped at 500 cm/s translation and 360°/s rotation.

Compared with inertialization, nothing is extrapolated **past** the new pose, so there is no
overshoot however large the difference. The jump's landing here showed the failure it avoids:
the feet rose above the hips when a large inertial offset met a held frame.

## Foot placement, warping, steering, root offset

Recorded in `docs/motion-gasp-parity.md` (Feet; What GASP's graph has and this system has
not): foot placement, orientation and stride warping, steering and the root bone offset, with
the engine sources and the parts ported so far.

## The camera

GASP runs the Gameplay Cameras system (asset):
- `GameplayCamera` component, standalone;
- `CameraAsset_SandboxCharacter` with a director, rigs from the `BasicThirdPersonBehavior`
  prefab, and `SmoothBlendCameraNode` between rigs.

The rigs:
- Close, Medium and Far distances, each in Freecam, Strafe and Aim modes;
- Far also has Ragdoll;
- plus TwinStick, a crouch offset and a collision offset.

Each rig overrides `BoomArmOffset`, `CameraOffset`, `FieldOfView` and three damping factors,
forward, lateral and vertical (named).

A classic spring arm is also on the character, used only when the Gameplay Camera is off
(asset):
- arm length 300 cm, 12 cm above the capsule centre, following the pawn's control rotation;
- position lag speed 10 with substepping; no rotation lag;
- collision probe 12 cm.

What the running camera actually does — where it sits against the character, its pitch, its
field of view, how it trails a start and a stop — is in the measured section below.

## Measured in play

Measured by `scripts/gasp/measure_gasp_pie.py` in `DefaultLevel`, 1522 frames at 15–33 ms each.
The curves come from `node scripts/gasp/analyse_gasp_frames.mjs`. The screenshots
(`Saved/gasp_measure/*.png`, copied locally to `wip/gasp-reference/`) are GASP's own content,
so they stay out of the repository; the script reproduces them.

Speeds are in cm/s. Times are seconds since the input changed. The first ~0.1 s of every curve
includes input latency: the command reaches the pawn a frame or two late.

### The running game uses the Demo speeds

The sandbox level runs the `*_Demo` speed vectors (asset), not the full ones. The measured peaks
are the Demo values:

| gait | peak | 90% of peak reached |
|---|---|---|
| walk | 165 | 0.44 s |
| run | 375 | 0.54 s (forward), 0.45 s (from rest to the right) |
| sprint | 585 (Demo 600, held under by the strafe blend while turning) | 0.92 s, including a 180° turn |

### Starts

| t | 0.1 | 0.2 | 0.3 | 0.5 | 0.75 | 1.0 |
|---|---|---|---|---|---|---|
| walk | 6 | 46 | 91 | 158 | 165 | 165 |
| run | 12 | 69 | 144 | 300 | 373 | 375 |
| sprint (starting with a 180° turn) | 16 | 71 | 145 | 293 | 469 | 552 |

Past the latency the acceleration is close to constant and depends on the gait:
- walk: about 450 cm/s²;
- run: about 780 cm/s²;
- sprint: the same ~780 up to run speed, then it falls to roughly 330 and less as the body
  approaches 585.

This is not the asset's `MaxAcceleration` 500. GASP's Blueprint recomputes acceleration, braking
and friction every tick (`CalculateMaxAcceleration` and its siblings, named); the numbers the
running game produces are the ones to copy.

### Stops

| t | 0 | 0.1 | 0.2 | 0.3 | 0.5 | 0.75 | 1.0 |
|---|---|---|---|---|---|---|---|
| from walk | 165 | 142 | 63 | 15 | 1 | 0 | 0 |
| from run | 375 | 350 | 277 | 180 | 24 | 0 | 0 |
| from sprint | 585 | 566 | 486 | 398 | 199 | 10 | 0 |

Braking is close to a constant deceleration of 800–1000 cm/s² at every speed, with a softer
tail under ~40 cm/s. The asset's own braking (friction 8 × the default `BrakingFrictionFactor`
2, plus 500 cm/s²) would stop a run in about a tenth of a second; the game does not.

The first stop in the programme (`stop`) shows a plateau at 319 from 0.2 to 0.5 s. That is a
screenshot stall — `HighResShot` fired at 0.1 s and froze a frame — not a braking feature. The
clean run stop is `stop_again`.

### Turns

The body turns toward the movement direction; the camera does not follow it.

Yaw in degrees, from rest, stick to the right (the body starts facing 0):

| t | 0.1 | 0.2 | 0.3 | 0.5 | 0.75 | 1.0 | 1.5 |
|---|---|---|---|---|---|---|---|
| yaw | 6 | 23 | 38 | 65 | 75 | 84 | 89 |

- The turn is fastest early, around 150°/s, and eases in over the last 25°. That is a
  spring-like approach, not the CMC's constant 360°/s.
- Reversing while running (facing 90, stick backward to 180): 94, 109, 125, 154, 165, 173 at
  0.1–1.0 s.
- The speed dips from 375 to about 299 at 0.2 s and is back by 0.5 s. The velocity bends round
  rather than collapsing.
- Starting a sprint with a 180° turn: the body is aligned (2°) at 1.0 s.

### The camera

At rest, relative to the capsule centre, in the character's frame:
- 220 cm behind, 40 cm to the right, 42 cm up;
- that puts the eye about 128 cm above the ground;
- pitch 0 (level), field of view 80° horizontal, about 50.5° vertical at 16:9.

The camera yaw stays where the player put it: moving and turning the body never swing it.

**The lag is one exponential follow at rate 10/s, on every axis.** At a steady speed the camera
trails the body by `speed × 0.1 s`:

| gait | speed | arm, running | arm − rest |
|---|---|---|---|
| walk | 165 | 237 | 17 |
| run | 375 | 258 | 38 |
| sprint | 585 | 278 | 58 |

- Sideways the same holds: running right at 375, the lateral offset falls from 40 to about 3,
  that is 37.5 cm of lag.
- Vertically nothing moves on flat ground (42 throughout).
- After a stop the arm returns to 220 within about 1 s.
- This matches the legacy spring arm's `CameraLagSpeed` 10 (asset), so the Gameplay Camera rig
  reproduces it.

The screenshots show the resulting composition:
- a low camera, level with the character's shoulders;
- the horizon at mid-frame;
- the character left of centre;
- the feet near the bottom quarter.
