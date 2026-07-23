import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Shape,
  SkinnedMesh,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const BLADE_DEPTH = 0.045
const SPINE_BONE = 'mixamorigSpine2'
const MIXAMO_SWORD_UNITS = 72
const BACK_MOUNT_LIFT = 0.68

/**
 * Creates an authored sword as a real skinned source part: every vertex is weighted
 * to Spine2. `mergeSkinnedModel` then folds it into Tany's final body mesh and atlas.
 */
export function createSwordMergePart(reference: SkinnedMesh): SkinnedMesh {
  const spineIndex = reference.skeleton.bones.findIndex((bone) => bone.name === SPINE_BONE)
  if (spineIndex < 0) throw new Error(`Tany rig is missing ${SPINE_BONE}`)
  const spine = reference.skeleton.bones[spineIndex]

  const blade = new Shape()
  blade.moveTo(0, 1.3)
  blade.lineTo(-0.09, 1.03)
  blade.lineTo(-0.065, 0.12)
  blade.lineTo(-0.026, 0)
  blade.lineTo(0.026, 0)
  blade.lineTo(0.065, 0.12)
  blade.lineTo(0.09, 1.03)
  blade.closePath()

  const guard = new Shape()
  guard.moveTo(-0.34, 0.045)
  guard.lineTo(-0.25, 0.09)
  guard.lineTo(-0.08, 0.055)
  guard.lineTo(-0.055, -0.035)
  guard.lineTo(0.055, -0.035)
  guard.lineTo(0.08, 0.055)
  guard.lineTo(0.25, 0.09)
  guard.lineTo(0.34, 0.045)
  guard.lineTo(0.27, -0.055)
  guard.lineTo(0.08, -0.09)
  guard.lineTo(0, -0.06)
  guard.lineTo(-0.08, -0.09)
  guard.lineTo(-0.27, -0.055)
  guard.closePath()

  const bladeGeometry = new ExtrudeGeometry(blade, {
    depth: BLADE_DEPTH,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  })
  const guardGeometry = new ExtrudeGeometry(guard, {
    depth: 0.072,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  })
  guardGeometry.translate(0, -0.028, -0.003)

  const gripGeometry = new CylinderGeometry(0.052, 0.058, 0.34, 6)
  gripGeometry.translate(0, -0.25, 0.024)
  const upperBand = new TorusGeometry(0.06, 0.01, 5, 8)
  upperBand.rotateX(Math.PI / 2)
  upperBand.translate(0, -0.1, 0.024)
  const lowerBand = new TorusGeometry(0.064, 0.011, 5, 8)
  lowerBand.rotateX(Math.PI / 2)
  lowerBand.translate(0, -0.4, 0.024)
  const pommel = new DodecahedronGeometry(0.078, 0)
  pommel.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(0.35, 0.2, 0)))
  pommel.translate(0, -0.47, 0.024)

  const authoredParts: BufferGeometry[] = [bladeGeometry, guardGeometry, gripGeometry, upperBand, lowerBand, pommel]
  // Extrusions are non-indexed while the lathed hilt pieces are indexed; normalize
  // once before composing the one source mesh for the character merger.
  const mergeParts = authoredParts.map((part) => (part.index ? part.toNonIndexed() : part))
  const geometry = mergeGeometries(mergeParts, false)
  for (const part of authoredParts) part.dispose()
  for (const part of mergeParts) {
    if (!authoredParts.includes(part)) part.dispose()
  }
  if (!geometry) throw new Error('Could not compose the sword merge part')

  reference.updateWorldMatrix(true, false)
  spine.updateWorldMatrix(true, false)
  const localSword = new Matrix4().compose(
    new Vector3(0.19, 0.05, 0.34).multiplyScalar(MIXAMO_SWORD_UNITS),
    new Quaternion().setFromEuler(new Euler(0.08, -0.18, 2.74)),
    new Vector3(0.77, 0.77, 0.77),
  )
  const swordInReferenceSpace = new Matrix4()
    .copy(reference.matrixWorld)
    .invert()
    .multiply(spine.matrixWorld)
    .multiply(localSword)
  // The source GLB is authored in centimetre-scale Mixamo units; the sword is
  // deliberately expanded before entering that same bind space.
  geometry.scale(MIXAMO_SWORD_UNITS, MIXAMO_SWORD_UNITS, MIXAMO_SWORD_UNITS)
  geometry.applyMatrix4(swordInReferenceSpace)
  // Tany's source geometry uses Z as its upright axis. Lift the already-bound
  // sword from the spine pivot to the shoulder-blade mount.
  geometry.translate(0, 0, BACK_MOUNT_LIFT)

  const vertexCount = geometry.getAttribute('position').count
  const skinIndex = new Uint16Array(vertexCount * 4)
  const skinWeight = new Float32Array(vertexCount * 4)
  for (let index = 0; index < vertexCount; index++) {
    skinIndex[index * 4] = spineIndex
    skinWeight[index * 4] = 1
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))

  const sword = new SkinnedMesh(geometry, new MeshBasicMaterial({
    color: '#b8d9f2',
    side: DoubleSide,
    toneMapped: false,
  }))
  sword.name = 'tany_sword_merge_source'
  sword.castShadow = true
  sword.frustumCulled = false
  sword.position.copy(reference.position)
  sword.quaternion.copy(reference.quaternion)
  sword.scale.copy(reference.scale)
  sword.bindMode = reference.bindMode
  sword.bind(reference.skeleton, reference.bindMatrix)
  reference.parent?.add(sword)
  return sword
}
