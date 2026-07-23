---
name: tripo-to-mixamo
description: Prepare a Tripo character for direct, untouched Mixamo FBX animations. Use when a Tripo GLB is sent through Blender/Mixamo, a With-Skin FBX must become the one runtime GLB model, an animation-only Mixamo FBX must play without retargeting, or skin normals/materials break after FBX conversion.
---

# Tripo to Mixamo

Keep the model and Mixamo animation as two contracts:

- **Model:** one generated GLB from the Mixamo **With Skin** FBX.
- **Animation:** the downloaded Mixamo FBX, copied byte-for-byte into the app and imported directly.

Never modify, bake, remap, rename, root-lock, or generate a derivative of an animation FBX. Do not use it as an input to a model-building script.

## Workflow

1. Export the Tripo character through Blender to FBX only to upload it to Mixamo. Do the orientation work before upload.
2. Download a **With Skin** FBX (for example Idle) from Mixamo. This is the only input used to create the model GLB.
3. Download each dance/action as **Without Skin** FBX. Preserve it as read-only; a runtime source copy must match the downloaded file with `cmp -s`.
4. Convert the With-Skin FBX with the **same FBX importer used by the app**. If the application loader uses `fbx2gltf`, use `fbx2gltf` for the model too. Do not use Blender for one side and a different FBX interpreter for the other.
5. If the With-Skin FBX lost its texture, transplant only the base-color material from the original Tripo GLB. Preserve `doubleSided`; missing it causes faces to disappear and can look like inverted normals.
6. Keep exactly one runtime character model in the character entity itself:
   `src/features/<character>/entities/<Character>/assets/models/`. Its private
   rig hook may sit beside the entity, but must import only these assets. Debug
   scenes must mount that same public entity.

Use the bundled builder from the target repository (it requires `fbx2gltf` and `@gltf-transform/core`):

```bash
node agents/skills/tripo-to-mixamo/scripts/build-mixamo-model.mjs \
  concepts/character/Idle.fbx \
  src/features/character/entities/Hero/assets/models/character-mixamo-rigged.glb \
  concepts/character/original-tripo.glb
```

The third argument is optional. It supplies a base-color texture only; it cannot affect the skeleton.

## Variant: skin swap over a SHARED skeleton's clips

Sometimes the new character does not carry its own animations — it reuses the clips
another character already ships (e.g. a mage skin driven by the shared `manique`
idle/run/attack). The clips come from a DIFFERENT Mixamo rig, so the new skin must
land in that rig's EXACT convention or the clips misbehave. Extra requirements on top
of the workflow above:

1. **Convert the skin with `fbx2gltf`, never Blender's glTF exporter** — this is the
   whole game. Blender's `export_scene.gltf` leaves a Mixamo rig in CENTIMETRE bones
   under a 90°-rotated armature node; the shared clips are authored in metres/identity,
   so their absolute hip translation lands in the wrong scale/orientation. `fbx2gltf`
   normalises to the metres/identity convention the clips expect. Blender is only for
   mesh edits (weight fixes) + scale, then export **FBX** and hand that to `fbx2gltf`.
2. **Match the joint-name prefix.** Mixamo names bones `mixamorig:` for a fresh upload
   but `mixamorig1:` when the upload already had a rig — the clips bind by EXACT node
   name, so rename the skin's joints to match the clips' prefix (a node-name rename is
   safe; GLB skinning is by joint index). Silent no-animation = prefix mismatch.
3. **Match height + feet-at-origin** to the shared skeleton (scale the rig in Blender
   before FBX export) — the clips set the hip to the reference character's ABSOLUTE
   metre height, so a smaller skin's feet dangle above the floor.

Do NOT try to fix a Blender-exported rig at runtime (group-scale, stripping/locking the
hip track): it grounds at best but the stop-jerk survives. Re-convert with `fbx2gltf`.

## Fixing Mixamo auto-weights on loose lower cloth (skirt / tabard / coat-tails)

Mixamo auto-rigs a multi-part skirt by weighting each hanging panel to BOTH thigh
bones. When the legs spread (walk/run) a panel that bridges the crotch stretches into
a web/tent between the legs. Fix it SURGICALLY, in Blender, before the FBX→fbx2gltf
step — do NOT blanket-rebind every panel:

- Rebind **only the front, crotch-spanning panel(s)** rigidly to `Hips` (clear leg
  weights, set that one bone to 1.0). Those hang as one solid piece from the waist;
  the legs emerge from underneath.
- **Leave the side and BACK panels on their original leg weights.** If you rebind them
  to Hips too, the back goes stiff and lifeless — it must keep swaying with the legs.
- Panels wrap around, so **classify front vs back first**: per-panel centroid on the
  facing axis, plus a color-coded render from the front AND the back (a panel visible
  in both is a side/wrap panel — leave it). Only the pure-front panel gets rebound.
- Verify by POSING the rig into a leg-spread stance and rendering: front panel should
  hang clean (no tent), side/back panels should still split and follow each leg.

## Layered animation — upper/lower body masks

To play two clips at once on one skeleton (legs run while the torso+arms cast/aim),
mask each clip to a body half and play both — each writes only its own bones, so
there is no blend conflict (no single full-body clip can express this).

- **Split the Mixamo humanoid by leaf bone name.** LOWER = the pelvis + both legs:
  a bone is lower iff its leaf matches `/(?:Hips|Leg|Foot|ToeBase)$/` (UpLeg and Leg
  both end in "Leg"). UPPER = everything else (Spine→Head, both arms, all fingers). No
  upper bone ends in those suffixes, so the suffix test is unambiguous and
  prefix-independent (`mixamorig` or `mixamorig1`). The pelvis (root) goes to LOWER so
  locomotion owns the character's position; the upper body rides on top.
- **Mask = drop the other half's tracks:** `clip.clone()`, then
  `tracks = tracks.filter(t => boneLayer(t.name.split('.')[0]) === layer)`. Strip the
  `.property` off the track name first to get the bone.
- **Play both masked actions at weight 1** (via `useAnimations`/mixer). Still pin the
  LOWER clip's hip X/Z so it runs in place. (Reference impl in this repo:
  `src/features/character/systems/boneMasks.ts` + the "Masked · run + cast" demo in
  `character-lab`.)

## Runtime contract

```ts
import danceUrl from './assets/animations/macarena.fbx'
import modelUrl from './assets/models/character-mixamo-rigged.glb'
```

Load both with the same runtime loader path and apply the FBX action directly to the model group. Do not clone or edit animation tracks to pin root motion unless the user explicitly requests a changed animation.

## Required checks

Before delivery:

1. Confirm the source dance copy is exact: `cmp -s <downloaded.fbx> <app-copy.fbx>`.
2. Check the model GLB has one skin, expected bone names, a base-color texture, and `doubleSided: true` when its source material is double-sided.
3. Run a headed browser: capture idle and a mid-dance pose. Check hands/feet, face orientation, texture, and missing faces.
4. Run the app build. Treat a build-produced browser asset as packaging only, never as a checked-in derivative of the animation source.

## Failure map

| Symptom | Cause | Fix |
| --- | --- | --- |
| Twisted limbs or 90° model turn | Model and action passed through different FBX axis/pre-rotation interpreters | Rebuild only the model using the runtime FBX importer. |
| Character floats above ground, or jerks/pops forward-then-back for 1–2 frames on run→idle | Model was converted with Blender glTF export → cm bones under a 90° armature node, while the shared clips are metres/identity. Grounding, group-scale, hip-lock band-aids leave the stop-jerk | Re-convert the model with `fbx2gltf` (never Blender's glTF exporter) so it matches the clips' metres/identity convention. |
| A specific clip drags the body through the floor (others are fine) | That clip was captured at a different character size than the rig — its root (Hips) Y sits at e.g. ~0.5 while the rig stands at ~1.0, and keeping the raw Y drags everything down | Normalise the clip's root position-track Y at load: multiply by `refHipY / thisClipPeakHipY`, where `refHipY` is a known-good clip's peak hip Y. Do it for every clip so it's a systemic floor guard (correct clips get factor ≈ 1). |
| No animation at all, mesh in bind pose | Joint-name prefix mismatch (`mixamorig` vs `mixamorig1`) between skin and clip | Rename to match: the skin's joints (node names) OR, for a single added clip on the wrong prefix, the clip's TRACK names — `track.name = track.name.replace(/^mixamorig(?!1)/, 'mixamorig1')`. three.js warns "No target node found for track: mixamorigHips…" and STRIPS the `:` when sanitizing, so match on the "1", not the colon. |
| Yellow/flat silhouette | Base-color texture is missing or not assigned | Transplant base-color material from original Tripo GLB. |
| Holes / apparently inverted normals | `doubleSided` was lost during conversion | Preserve the original material's `doubleSided` flag; do not rewrite the animation. |
| Extra character assets | Stale experiments remain | Keep one runtime GLB; remove superseded generated models only with user authorization. |
