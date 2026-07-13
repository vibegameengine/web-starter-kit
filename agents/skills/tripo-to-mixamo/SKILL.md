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
| Yellow/flat silhouette | Base-color texture is missing or not assigned | Transplant base-color material from original Tripo GLB. |
| Holes / apparently inverted normals | `doubleSided` was lost during conversion | Preserve the original material's `doubleSided` flag; do not rewrite the animation. |
| Extra character assets | Stale experiments remain | Keep one runtime GLB; remove superseded generated models only with user authorization. |
