import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  type Object3D,
} from 'three'

import { atlasLayout } from './atlasLayout'
import { collectSkinnedMeshes } from './collectSkinnedMeshes'
import { mergeSkinnedGeometry } from './mergeSkinnedGeometry'
import { packAtlas } from './packAtlas'
import type { AtlasSource, MergeOptions } from './types'

/** Conservative GPU texture cap if the renderer's isn't available at build time. */
const MAX_ATLAS = 4096

/**
 * Compose a many-part skinned character (a Tripo `generate_parts` skin kept SEPARATE in
 * the asset for a future inventory) into ONE fresh `SkinnedMesh` for rendering → 1 draw
 * call + 1 shadow caster. Builds a base-color atlas, merges the geometry (UV-remapped,
 * bind-realigned — see `mergeSkinnedGeometry`), creates a NEW `SkinnedMesh` bound to the
 * scene's EXISTING skeleton (the bones the animation mixer already drives), adds it beside
 * part 0 and detaches the originals. Returns `null` for `< 2` parts (caller renders as-is).
 *
 * Does NOT dispose the source parts' geometries/materials/textures — `SkeletonUtils.clone`
 * shares them by reference with the `useGLTF` cache and sibling instances. Only the caller's
 * toolkit-owned outputs (merged geometry, merged material, atlas) should be disposed on unmount.
 */
export function mergeSkinnedModel(scene: Object3D, options: MergeOptions = {}): SkinnedMesh | null {
  const parts = collectSkinnedMeshes(scene)
  if (parts.length < 2) return null
  const refPart = parts[0]

  // Atlas layout, shrinking the cell if the atlas would exceed the GPU texture cap.
  let cell = options.cell ?? 512
  const gutter = (px: number) => Math.max(2, Math.round(px / 64))
  let layout = atlasLayout(parts.length, cell, gutter(cell))
  while (layout.width > MAX_ATLAS && cell > 64) {
    cell = Math.floor(cell / 2)
    layout = atlasLayout(parts.length, cell, gutter(cell))
  }

  // Only the base-color (albedo) channel is packed today; `normal` is accepted but a no-op.
  if (options.channels?.albedo === false) return null

  const sources: AtlasSource[] = parts.map((part) => {
    const material = part.material as MeshBasicMaterial & { map?: { image?: CanvasImageSource } | null }
    return { image: material.map?.image ?? null, color: material.color ?? null }
  })
  const canvas = packAtlas(sources, layout)
  if (!canvas) return null

  const merged = mergeSkinnedGeometry(parts, layout, refPart)
  if (!merged) return null

  const atlas = new CanvasTexture(canvas)
  atlas.colorSpace = SRGBColorSpace
  atlas.flipY = false // glTF UV convention (v=0 at top) — matches the source maps
  atlas.anisotropy = 4
  atlas.minFilter = LinearMipmapLinearFilter
  atlas.magFilter = LinearFilter

  const containsDoubleSidedPart = parts.some(
    (part) => (part.material as MeshBasicMaterial).side === DoubleSide,
  )
  const body = new SkinnedMesh(merged, new MeshBasicMaterial({
    map: atlas,
    side: containsDoubleSidedPart ? DoubleSide : undefined,
    toneMapped: false,
  }))
  body.name = 'merged_body'
  body.castShadow = true
  body.receiveShadow = false
  body.frustumCulled = false
  if (options.interactive === false) body.raycast = () => {}

  // Sit in part 0's node space (its bind space is what the geometry was realigned into),
  // then bind to the SHARED skeleton + part 0's bind matrix. No new skeleton — the mixer
  // already animates `skeleton.bones`, so the fresh mesh follows for free.
  body.position.copy(refPart.position)
  body.quaternion.copy(refPart.quaternion)
  body.scale.copy(refPart.scale)
  body.matrixAutoUpdate = refPart.matrixAutoUpdate
  body.bindMode = refPart.bindMode
  body.bind(refPart.skeleton, refPart.bindMatrix)

  refPart.parent?.add(body)
  for (const part of parts) part.removeFromParent()
  return body
}
