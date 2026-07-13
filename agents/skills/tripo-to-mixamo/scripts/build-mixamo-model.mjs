/** Build one Mixamo-compatible model GLB without accepting an animation FBX. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'
import convertFbxToGltf from 'fbx2gltf'

const [withSkinFbx, outputGlb, textureSourceGlb] = process.argv.slice(2)
if (!withSkinFbx || !outputGlb) {
  throw new Error('Usage: node build-mixamo-model.mjs <with-skin.fbx> <output.glb> [texture-source.glb]')
}

const temp = await mkdtemp(path.join(tmpdir(), 'mixamo-model-'))
const converted = path.join(temp, 'model.glb')
try {
  await convertFbxToGltf(withSkinFbx, converted, ['--binary'])
  const io = new NodeIO()
  const model = await io.read(converted)
  if (model.getRoot().listSkins().length !== 1) throw new Error('With-Skin FBX must produce exactly one skin')

  if (textureSourceGlb) await transplantBaseColor(model, await io.read(textureSourceGlb))
  await writeFile(outputGlb, await io.writeBinary(model))
  console.log(`Mixamo model written: ${outputGlb}; bones=${model.getRoot().listSkins()[0].listJoints().length}`)
} finally {
  await rm(temp, { force: true, recursive: true })
}

async function transplantBaseColor(model, textureSource) {
  const sourceMaterial = textureSource.getRoot().listMaterials().find((material) => material.getBaseColorTexture())
  const sourceTexture = sourceMaterial?.getBaseColorTexture()
  const image = sourceTexture?.getImage()
  if (!sourceMaterial || !sourceTexture || !image) throw new Error('Texture source has no base-color image')

  const before = rigSignature(model)
  const texture = model.createTexture('character-base-color')
    .setImage(image)
    .setMimeType(sourceTexture.getMimeType())
  const material = model.createMaterial('character-painted')
    .setBaseColorFactor(sourceMaterial.getBaseColorFactor())
    .setBaseColorTexture(texture)
    .setDoubleSided(sourceMaterial.getDoubleSided())
  for (const mesh of model.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) primitive.setMaterial(material)
  }
  if (before !== rigSignature(model)) throw new Error('Material transplant changed the rig contract')
}

function rigSignature(document) {
  const nodes = document.getRoot().listNodes().map((node) => ({
    name: node.getName(), parent: node.getParentNode()?.getName() ?? '',
    translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
  }))
  const inverseBinds = document.getRoot().listSkins().flatMap((skin) => Array.from(skin.getInverseBindMatrices()?.getArray() ?? []))
  return JSON.stringify({ nodes, inverseBinds })
}
