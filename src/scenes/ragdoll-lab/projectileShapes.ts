import { BoxGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry } from 'three'

/**
 * The things you can throw at the body, defined ONCE.
 *
 * Every shot reuses the same geometry and the same material instance. A lab that
 * builds `new SphereGeometry()` per projectile leaks a GPU buffer per shot and
 * compiles a fresh program per material, which shows up as a stutter on exactly
 * the frame you were trying to watch — and the stutter is then read as the
 * physics hitching rather than as the lab's own bookkeeping.
 *
 * Sizes are deliberately in the same range as a limb capsule: a pebble bounces
 * off without telling you anything, and a boulder simply deletes the pose.
 */

export type ProjectileShapeId = 'box' | 'capsule' | 'cylinder' | 'sphere'

/** Collider description for the rapier side, in the shape's own half-extents. */
export type ProjectileCollider =
  | { readonly kind: 'ball'; readonly radius: number }
  | { readonly kind: 'capsule'; readonly halfHeight: number; readonly radius: number }
  | { readonly kind: 'cuboid'; readonly halfExtents: readonly [number, number, number] }
  | { readonly kind: 'cylinder'; readonly halfHeight: number; readonly radius: number }

export type ProjectileShape = {
  readonly collider: ProjectileCollider
  readonly geometry: BoxGeometry | CapsuleGeometry | CylinderGeometry | SphereGeometry
  readonly id: ProjectileShapeId
  readonly label: string
  /** Kilograms. Heavy enough to move a limb, light enough not to erase the body. */
  readonly mass: number
}

/** One material for all of them: what is being judged is the physics, not the paint. */
export const projectileMaterial = new MeshStandardMaterial({
  color: '#7f93a8',
  metalness: 0.1,
  roughness: 0.55,
})

const BALL_RADIUS = 0.15
const BOX_HALF = 0.14
const CAPSULE_RADIUS = 0.11
const CAPSULE_HALF = 0.14
const CYLINDER_RADIUS = 0.15
const CYLINDER_HALF = 0.16

export const PROJECTILE_SHAPES: readonly ProjectileShape[] = [
  {
    collider: { kind: 'ball', radius: BALL_RADIUS },
    geometry: new SphereGeometry(BALL_RADIUS, 20, 14),
    id: 'sphere',
    label: 'Sphere',
    mass: 6,
  },
  {
    collider: { halfExtents: [BOX_HALF, BOX_HALF, BOX_HALF], kind: 'cuboid' },
    geometry: new BoxGeometry(BOX_HALF * 2, BOX_HALF * 2, BOX_HALF * 2),
    id: 'box',
    label: 'Cube',
    mass: 7,
  },
  {
    collider: { halfHeight: CAPSULE_HALF, kind: 'capsule', radius: CAPSULE_RADIUS },
    // three's CapsuleGeometry takes the length of the cylindrical part, which is
    // twice rapier's half-height — the same capsule, described two ways.
    geometry: new CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF * 2, 8, 14),
    id: 'capsule',
    label: 'Capsule',
    mass: 5,
  },
  {
    collider: { halfHeight: CYLINDER_HALF, kind: 'cylinder', radius: CYLINDER_RADIUS },
    geometry: new CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, CYLINDER_HALF * 2, 18),
    id: 'cylinder',
    label: 'Cylinder',
    mass: 8,
  },
]

export function projectileShapeFrom(value: string | null | undefined): ProjectileShape {
  return PROJECTILE_SHAPES.find((shape) => shape.id === value) ?? PROJECTILE_SHAPES[0]
}
