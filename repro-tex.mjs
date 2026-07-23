import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, prune, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(
  'src/features/character/entities/Tany/assets/models/tany-idle-mixamo-rigged.glb',
)

const stripToAlbedo = () => (document) => {
  for (const material of document.getRoot().listMaterials()) {
    material.setNormalTexture(null)
    material.setMetallicRoughnessTexture(null)
    material.setEmissiveTexture(null)
    material.setOcclusionTexture(null)
  }
}

try {
  await doc.transform(
    stripToAlbedo(),
    dedup(),
    flatten(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [1024, 1024],
      quality: 80,
      slots: /^(?!normalTexture$).*/,
    }),
  )
  console.log('pass 1 OK')
} catch (e) {
  console.log('pass 1 FAIL:', e.message)
}

console.log(
  'textures after pass1:',
  doc
    .getRoot()
    .listTextures()
    .map((t) => [t.getName(), t.getMimeType(), t.getImage()?.byteLength]),
)

try {
  await doc.transform(
    textureCompress({
      encoder: sharp,
      resize: [1024, 1024],
      slots: /^normalTexture$/,
    }),
  )
  console.log('pass 2 OK')
} catch (e) {
  console.log('pass 2 FAIL:', e.message)
  console.log(e.stack)
}
