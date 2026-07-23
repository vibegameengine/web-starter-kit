import { BufferAttribute, BufferGeometry, Matrix4, type SkinnedMesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { AtlasLayout } from './types'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Merge every part's geometry into ONE `BufferGeometry` skinned by `refPart`'s skeleton.
 *
 * Per part it rebuilds `{position, normal, uv, skinIndex, skinWeight}` into canonical,
 * DE-QUANTIZED arrays (Float32/Uint16) — `?meshopt` ships attributes as normalized ints and
 * `mergeGeometries` needs identical array types across inputs. Then it:
 *  - remaps UVs into the part's atlas cell (`layout.cellUv(i)`),
 *  - remaps `skinIndex` onto `refPart`'s skeleton BY BONE NAME (parts ship distinct skin
 *    objects with possibly-different bone order),
 *  - **realigns the part into `refPart`'s bind space** with `Tᵢ = inv(IBM_ref) · IBMᵢ`
 *    (matched by bone name). This is the crux: meshopt bakes a per-part dequantization into
 *    each part's inverse-bind matrices, so without it parts 1..N deform wrong when bound to
 *    one skeleton. `Tᵢ` is identity without meshopt and corrective with it.
 *
 * Disposes its temporaries; returns `null` if the merge fails.
 */
export function mergeSkinnedGeometry(
  parts: readonly SkinnedMesh[],
  layout: AtlasLayout,
  refPart: SkinnedMesh,
): BufferGeometry | null {
  const skeleton = refPart.skeleton
  const boneIndexByName = new Map<string, number>()
  skeleton.bones.forEach((bone, i) => boneIndexByName.set(bone.name, i))
  const name0 = skeleton.bones[0].name
  const inv0 = new Matrix4().copy(skeleton.boneInverses[0]).invert()
  const alignMatrix = new Matrix4()

  const geometries: BufferGeometry[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const uvRect = layout.cellUv(i)
    const src = part.geometry
    const vertexCount = src.getAttribute('position').count
    const geometry = new BufferGeometry()

    const srcPos = src.getAttribute('position')
    const position = new Float32Array(vertexCount * 3)
    for (let k = 0; k < vertexCount; k++) { position[3 * k] = srcPos.getX(k); position[3 * k + 1] = srcPos.getY(k); position[3 * k + 2] = srcPos.getZ(k) }
    geometry.setAttribute('position', new BufferAttribute(position, 3))

    const srcNor = src.getAttribute('normal')
    if (srcNor) {
      const normal = new Float32Array(vertexCount * 3)
      for (let k = 0; k < vertexCount; k++) { normal[3 * k] = srcNor.getX(k); normal[3 * k + 1] = srcNor.getY(k); normal[3 * k + 2] = srcNor.getZ(k) }
      geometry.setAttribute('normal', new BufferAttribute(normal, 3))
    } else {
      geometry.computeVertexNormals()
    }

    // Tᵢ = inv(IBM_ref) · IBMᵢ, matched by the shared bone name.
    const ii = part.skeleton.bones.findIndex((b) => b.name === name0)
    if (ii >= 0) {
      alignMatrix.multiplyMatrices(inv0, part.skeleton.boneInverses[ii])
      geometry.applyMatrix4(alignMatrix)
    }

    if (src.getIndex()) {
      geometry.setIndex(new BufferAttribute(Uint32Array.from(src.getIndex()!.array), 1))
    }

    const srcUv = src.getAttribute('uv')
    const uv = new Float32Array(vertexCount * 2)
    for (let k = 0; k < vertexCount; k++) {
      const u = srcUv ? clamp01(srcUv.getX(k)) : 0
      const v = srcUv ? clamp01(srcUv.getY(k)) : 0
      uv[2 * k] = uvRect.ox + u * uvRect.sx
      uv[2 * k + 1] = uvRect.oy + v * uvRect.sy
    }
    geometry.setAttribute('uv', new BufferAttribute(uv, 2))

    const remap = part.skeleton.bones.map((b, bi) => boneIndexByName.get(b.name) ?? bi)
    const srcSi = src.getAttribute('skinIndex')
    const srcSw = src.getAttribute('skinWeight')
    const skinIndex = new Uint16Array(vertexCount * 4)
    const skinWeight = new Float32Array(vertexCount * 4)
    for (let k = 0; k < vertexCount; k++) {
      const ix = [srcSi.getX(k), srcSi.getY(k), srcSi.getZ(k), srcSi.getW(k)]
      const wt = [srcSw.getX(k), srcSw.getY(k), srcSw.getZ(k), srcSw.getW(k)]
      for (let c = 0; c < 4; c++) { skinIndex[4 * k + c] = remap[ix[c]] ?? 0; skinWeight[4 * k + c] = wt[c] }
    }
    geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
    geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))

    // Source parts can legitimately mix indexed GLB geometry with procedural,
    // non-indexed geometry. `mergeGeometries` requires one convention, so make
    // every canonical source indexless after its skin data has been rebuilt.
    const mergeReady = geometry.index ? geometry.toNonIndexed() : geometry
    if (mergeReady !== geometry) geometry.dispose()
    geometries.push(mergeReady)
  }

  const merged = mergeGeometries(geometries, false)
  for (const g of geometries) g.dispose()
  return merged
}
