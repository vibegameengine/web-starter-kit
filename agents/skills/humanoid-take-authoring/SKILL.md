---
name: humanoid-take-authoring
description: Author a NEW animation take on a rigged humanoid by posing bones procedurally in Blender and exporting it for the runtime. Use whenever a character animation has to be created or corrected rather than downloaded — a posture, an idle, a transition, a hand action, a hold — and whenever a limb, wrist or finger comes out twisted, the sleeve shatters, a pose that is right in Blender is wrong in the game, or an exported clip loses its motion. Covers the authoring rig, joint rotation, hinge joints, twist budgets, ground contact, keying, export and the measurements that catch each failure.
when_to_use: Authoring or fixing a character take; a limb reads wrong in game but right in Blender; mesh shards at a joint; a wrist looks broken; an exported clip is flat, collapsed or missing bones; deciding where keys belong.
allowed-tools: Read Bash Glob Grep mcp__blender__execute_blender_code mcp__blender__get_scene_info mcp__blender__get_viewport_screenshot
---

# Authoring a humanoid take

Downloaded takes are a solved problem — see `tripo-to-mixamo`: copy the FBX in and
play it. This skill is the other case, where a take has to be MADE. Everything
below was paid for with a defect that shipped or nearly shipped, and each rule
carries the measurement that exposes it.

## 1. The authoring rig is the GAME's model, never a Blender FBX import

Blender does not read a skeleton out of an FBX, it RECONSTRUCTS one: FBX stores
joint transforms, a Blender bone needs a tail and a roll, and what the importer
infers is not what the file meant. The take you then export is local rotations
against THAT rest, while the runtime applies them against the rest in the shipped
model.

Measured against one shipped character:

| take | rest differs from the game model |
| --- | --- |
| stock Mixamo clips, never opened in Blender | 12° mean, 62° worst |
| anything round-tripped through Blender's **FBX** importer | **33° mean, 116° worst — at the thigh** |
| authored on Blender's **glTF** import of the shipped model | **0.01° mean, 0.04° worst** |

**Import the game's own GLB and export glTF.** Donor takes may still arrive as
FBX — only their bone ORIENTATIONS are read and those are roll-independent — but
the TARGET rig must be the model the runtime loads.

Check it, do not assume it:

```python
# per bone: angle between the take's rest rotation and the shipped model's
2 * acos(abs(dot(q_take_rest, q_model_rest))) * 180 / pi
```

Two exporter traps on that path: Blender's glTF exporter silently **skips hidden
objects** (an armature hidden for a screenshot exports an empty file), and it
exports whichever action is ACTIVE — donor imports leave their actions behind, so
purge them first.

## 2. Turn a bone from its REST orientation, never from its current one

The obvious helper — "rotate this bone so it points at X" applied to the bone's
present orientation — accumulates. Chained down a limb, each link adds its own
twist to the one before. Direction always looks right; the roll walks away.

```python
delta = rest_direction.rotation_difference(wanted_direction)
world  = delta @ rest_world_rotation          # NOT @ current_world_rotation
```

Same for finger curls: bend from rest, never compound onto the pose.

**Do not "fix" this by building a basis from an invented up-axis.** That pins the
roll to the wrong value: the rest roll is discarded, the pose lands tens of
degrees out, and the skin shatters into shards. Worse than the original.

## 3. A hinge has no twist — and shortest-arc cannot be trusted near 180°

An elbow and a knee are hinges. The twist of the forearm about its own length,
relative to the upper arm, must stay at whatever the rest pose has. Anything else
is a bone wrung inside its own sleeve.

Shortest-arc aiming breaks exactly where limbs need it most. When the wanted
direction approaches the OPPOSITE of the rest direction, the rotation axis is
degenerate and the roll it produces is arbitrary. A rest-down forearm swinging up
to the mouth is that case. Measured across one authored loop:

| t (s) | 0.2 | 0.6 | 1.0 | 1.4 | 1.8 | 2.2 |
| --- | --- | --- | --- | --- | --- | --- |
| forearm twist | 36.7° | **169.6°** | 80.5° | 1.1° | 81.8° | 1.1° |

The other arm, holding something in front — a small turn from rest — measured
0.6° throughout. Same code, and the signature of this bug is exactly that: fine
where the turn is small, wild where it approaches a reversal.

**So do not aim a hinge child by direction at all.** Rotate it about the HINGE
AXIS, taken from the parent's frame (the normal of the shoulder–elbow–wrist
plane). The direction comes out as a consequence. Then assert:

```python
rel   = inverse(parent_world_rot) @ child_world_rot
twist = swing_twist_about(rel, bone_length_axis)      # must stay near rest
```

## 4. Twist is a number, and only a number will find it

A wrung forearm is nearly invisible from the front, invisible at gameplay
distance, and completely invisible in a hips-height or stance-width readout. It
shows from the SIDE, at magnification. Print the twist per joint for every take
you author; treat a hinge above ~10° from rest as a defect.

## 5. No twist bone means no pronation

If the rig has one forearm bone and no twist bone, rolling the forearm rotates
its whole length — elbow end included — and a crudely weighted crease tears.
On such a rig ALL wrist twist lives in the hand bone and stays small (±45°).
A solver left unclamped will happily ask for 180°, which is a full flip of one
bone and destroys the skinning.

Know the mesh's bend budget too. On one character the elbow crease tore open
below ~70° of bend and was clean at 120°; that is a WEIGHTS limit, and no
animation change fixes it — either stay inside the budget or reweight the model.

## 6. Key the BEATS, not every frame

A procedural bake writes a key per frame per channel because that is how the pose
is computed, not because the motion needs it. The result is an action nobody can
read or hand-edit. Key only the control points of the ramps that drive the pose —
typically 3 to 10 per take — and let interpolation carry between them.

Two things bite here:

- Blender's glTF exporter **resamples** unless told otherwise, throwing the sparse
  keys away — but turning sampling OFF made it write a **zero local translation
  for the hips**, which drops the body to the origin. Keep the sparse keys in the
  `.blend` (the editable artefact) and let the export sample; thin afterwards.
- Thinning must be done **per shared input accessor**: samplers share their time
  axis, so per-sampler thinning rewrites it once per user and leaves outputs
  longer than their own input — a corrupt clip. Group by input, agree one
  keep-list, rewrite each accessor once. Verify `input.length ===
  output.length / elementSize` for every sampler afterwards.
- Decimate GREEDILY over the whole span: extend while every sample inside still
  lies on the line between the ends. Comparing a candidate against its immediate
  neighbour is meaningless — three consecutive samples of a smooth curve are
  always nearly collinear — and it flattened a breathing loop to a constant.

## 7. Ground contact comes from the evaluated MESH, by skin weights

Not from a bone height, and not from a coordinate slab. A y-split heuristic kept
catching a coat skirt and reported contact while the body hung 9 cm in the air.
Take the lowest vertex among those whose DOMINANT vertex group is the bone in
question — hips, thighs, feet — and drop the pose by shifting the ROOT alone so
nothing else about it changes.

## 8. `fbx2gltf` drops a track whose value never changes

A pose held perfectly still therefore loses those bones and they snap back to
BIND. Give the joints an idle's real micro-motion (0.2–1.1°) rather than fighting
the converter. Leaf bones (`*_End`, last finger joints) may stay constant — their
rotation carries no pose. The HIPS need a rotation track even when still, or the
pelvis keeps whatever yaw the outgoing clip left on it.

## 9. Verification

- Look from the axis the defect lives on. A twist shows from the side; a sinking
  body shows against a lit floor; neither shows in a wide shot.
- Look at MAGNIFICATION. A hand thirty pixels tall hides a shattered wrist.
- Look in the GAME, not only in the authoring app. Blender being right is exactly
  the symptom of rule 1.
- Numbers verify the thing they measure and nothing else. Hips drift proves a
  mask does not leak into the legs; it says nothing about the hand.
- **A control that runs through your own posing code is not a control.** Compare
  against something the code never touched — a stock take, or the hand-fixed pose.
- Do not work around a defect before establishing whose it is. Repositioning a
  limb to dodge a tear, before measuring whether the tear is yours, changes a
  second thing and buries the first.

See `visual-verification-gate` for the evidence contract and `animation-quality-gate`
for accepting motion.
