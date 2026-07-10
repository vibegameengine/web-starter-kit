// Move a GLB's origin to the FEET (bottom-center) so it stands on y=0 when placed.
//
// Tripo (and most image-to-3D) exports pivot at the bounding-box CENTER, which is
// wrong for game characters — you want feet at the origin so `scene.position.y = 0`
// puts them on the ground. This recenters X/Z on the footprint centre and drops the
// bounding-box minimum Y to 0, baking the shift into the scene's root nodes.
//
//   node scripts/glb-origin-to-feet.mjs <input.glb> [output.glb]
//
// Defaults to overwriting the input. Prints before/after bounds.

import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const input = process.argv[2]
const output = process.argv[3] ?? input
if (!input) { console.error('usage: glb-origin-to-feet.mjs <input.glb> [output.glb]'); process.exit(1) }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]

const before = getBounds(scene)
const cx = (before.min[0] + before.max[0]) / 2
const cz = (before.min[2] + before.max[2]) / 2
const minY = before.min[1]
const offset = [-cx, -minY, -cz]

for (const node of scene.listChildren()) {
  const t = node.getTranslation()
  node.setTranslation([t[0] + offset[0], t[1] + offset[1], t[2] + offset[2]])
}

await io.write(output, doc)

const after = getBounds(scene)
const f = (a) => a.map((v) => v.toFixed(3)).join(', ')
console.log(`offset applied: [${f(offset)}]`)
console.log(`before  min [${f(before.min)}]  max [${f(before.max)}]`)
console.log(`after   min [${f(after.min)}]  max [${f(after.max)}]  (min Y ~0, X/Z centred)`)
console.log('wrote', output)
