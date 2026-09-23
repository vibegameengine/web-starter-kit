# Moving animation clips between skeletons

**Portable (kit).** The method, the pipeline and the three.js lessons below hold for any
three.js project that plays clips authored on one skeleton on a character rigged with another.
The numbers are this project's: the Universal Animation Library on the Mixamo mannequin.

## The problem

The Universal Animation Library (Quaternius, CC0, vendored at
`src/features/motion/assets/library/`) is 43 clips on a UE5 mannequin: 65 bones named
`pelvis`, `spine_01`, `thigh_l`… The runtime character is a Mixamo rig: `mixamorigHips`,
`mixamorigLeftUpLeg`… A three.js clip binds its tracks by node name, so a library clip on the
Mixamo rig does not play badly — it does not play at all.

Renaming the tracks is not enough either. The two skeletons disagree on every bone's local
axes, on the rest pose and on scale. A local rotation copied from one bone to the other turns a
different axis.

## The method — `src/shared/lib/animation/retarget.ts`

For each mapped bone, on every key time of the source clip:

1. Play the source clip on its own skeleton and read the bone's **world** rotation.
2. Take the change from a reference pose, in world axes:
   `change = sourceNow · inverse(sourceReference)`.
3. Turn that change into the target's facing: `facing · change · inverse(facing)`, where
   `facing` is the yaw that takes the source's hip line onto the target's.
4. Apply it to the target bone's rest world rotation, and bring the result back into the
   target bone's parent space: `local = inverse(parentWorld) · change · targetRestWorld`.

Bones are written parent first, on the real target nodes, so duplicated or intermediate nodes
in the target hierarchy (FBXLoader makes two nodes per bone) are accounted for automatically.

**The reference is not simply the source's rest.** If the source rests in an A-pose and the
target in a T-pose, "no change from rest" puts the target's arms out level where the source's
hang down. So limbs flagged `align` are swung first: the source's reference for that bone is
rotated so the bone points where the target's rest bone points. This is the chain alignment
Unreal's IK Retargeter does. The spine is deliberately **not** aligned: UE's spine is curved at
rest and Mixamo's is straight by design, and aligning it would bend the Mixamo spine into UE's
curve.

**The pelvis also carries travel.** Its world displacement from rest is rotated into the
target's facing and scaled by the ratio of the two pelvis heights. With the mannequin 8.8%
taller than the library's, a crouch or a jump comes out at the target's own size.

`UE5_TO_MIXAMO` is the full map, fingers included.

## The pipeline — `scripts/retarget-animations.mjs`

`node scripts/retarget-animations.mjs [ClipName…]` retargets the named library clips and writes
one GLB per clip to `src/features/motion/assets/animations/`. Three things make the output play
on the rig the game actually runs:

- **The target is the runtime rig.** The mannequin goes through `fbx2gltf --binary` exactly as
  the Vite FBX plugin loads it, never through FBXLoader. The clip writes local rotations, and a
  local rotation only means something against the node it was computed for.
- **Positions are written in the clip family's units.** The existing clips are Mixamo's, in
  centimetres, and the runtime scales every clip by one factor taken from the idle clip
  (`clipScale.ts`). The retargeted clip comes out in the rig's metres. So its positions are
  multiplied by exactly the inverse of what the runtime will apply (×99.2 here), and the
  runtime keeps one convention with one scale.
- **The pelvis is held in place horizontally, at the rig's own rest.** The capsule owns
  horizontal motion here: the Mixamo clips are converted with their hips' X and Z fixed, and
  `verify:clips` asserts it. The library's clips carry their pelvis sway along the ground —
  Jump_Start 13.5 cm, Jump_Land 9.7 cm, at up to 1.5 m/s. Kept, it read as the body sliding
  against the camera (`verify:judder`, 0.48 m/s in the windows around a landing).
  - Held at each clip's own first key, the sway was gone, but a landing blended in from a walk
    still slid the pelvis 5 cm (0.18 m/s).
  - Held at the rig's rest pelvis, every clip shares one horizontal pelvis and `verify:judder`
    passes again.
- **Contact times are measured, not typed.** From the retargeted clip on the rig, the script
  writes `retargetedClipMetrics.json`:
  - `takeoff`: the last frame before either foot rises more than 2 cm;
  - `touchdown`: when the feet meet the ground;
  - `absorb`: when the pelvis is lowest;
  - `settle`: when the pelvis is within 2 cm of its final height.

  Gameplay lines clips up with these numbers.

The script prints, per clip, **the worst angle between a source limb and the retargeted limb over
every frame.** That is the check that the transfer is a transfer. On the three jump clips it is
4.8°, on the spine (not aligned, see above). Every arm and leg agrees more closely. The feet
differ by a constant 3.7°, because the two rigs rest their feet at slightly different pitches
and the foot is not aligned either.

## The visual gate — the Retarget lab

`/labs/motion-retarget` plays a library clip on its own skeleton next to the retargeted copy on
the mannequin, with a shared playhead, frame stepping, both pelvis heights and the worst limb
disagreement read out live. A clip is accepted when the two figures hold the same pose frame
for frame, looked at in a headed browser.

## Measured, and falsified

- **The library's own notes say its rest pose is an A-pose.** In the GLB it is a T-pose, arms
  level at direction (1, 0, 0). The alignment step is kept anyway, since the process has to
  work for A-pose libraries.
- **A retargeted clip ended on its own first pose.** Sampling the source with a looping action
  and `setTime(duration)` wraps to frame 0: Jump_Start finished crouched at 0.569 m and
  Jump_Land in the air at 1.009 m. The fix is to sample with `LoopOnce` and
  `clampWhenFinished`. The same wrap misleads any probe that samples a clip's last key with a
  looping mixer, and it misled one here.
- **Restoring the rig to its bind pose between clips**, suspected necessary because the mixer
  might leave bones posed: the three GLBs came out byte-identical with and without it. three's
  mixer restores a binding's original state when its last action stops. Dropped.

## three.js: a held frame compounds everything applied after the mixer

**Portable (kit), and the costliest lesson of this work.**

`PropertyMixer.apply` writes a bone only when the value it mixed differs from the one it wrote
last time. While a clip holds one frame — a pose held at a fixed time, a clamped clip end — the
mixer stops writing. Anything that turned the bone after the mixer then stays on it and is
applied again the next frame: an inertial offset, an orientation warp, a leg solve. On the jump,
the landing clip was held at its touchdown frame while the legs reached for the ground. The
inertial offset compounded for fifteen frames and put the feet 25 cm **above** the hips.

The inertial curves themselves were correct. Replayed offline, the foot went monotonically from
0.50 m to 0.84 m below the hips. The runtime logged the curves decaying 99° → 59° → 34° → 15° on
the knee while the foot still climbed. That mismatch is what pointed at the mixer rather than
at the maths.

The fix is `createPoseSnapshot` (`src/shared/lib/animation/poseSnapshot.ts`):

- capture every bone right after `mixer.update`;
- put the bones back right before the next update.

Every frame then starts from the mixer's own pose, whether or not the mixer wrote it. The test
beside it reproduces the mixer's skip.
