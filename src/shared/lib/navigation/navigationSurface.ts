export type NavPoint2 = readonly [number, number]
export type NavigationElevationResolver = (x: number, z: number) => number

export type NavigationBlocker =
  | { readonly id: string; readonly kind: 'circle'; readonly center: NavPoint2; readonly radius: number }
  | { readonly id: string; readonly kind: 'orientedRect'; readonly center: NavPoint2; readonly halfSize: NavPoint2; readonly rotation: number }
  | { readonly id: string; readonly kind: 'corridor'; readonly points: readonly NavPoint2[]; readonly halfWidth: number }

export type NavigationSurfaceDescriptor = {
  readonly id: string
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
  readonly cellSize: number
  readonly elevation: number
  /**
   * Optional authored walkable elevation. It is shared by the nav bake and the
   * moving actors, so terrain, platforms and future stairs never disagree.
   */
  readonly elevationAt?: NavigationElevationResolver
  readonly blockers: readonly NavigationBlocker[]
}

export function navigationSurfaceElevationAt(
  descriptor: NavigationSurfaceDescriptor,
  x: number,
  z: number,
): number {
  return descriptor.elevationAt?.(x, z) ?? descriptor.elevation
}

function distanceToSegmentSquared(point: NavPoint2, start: NavPoint2, end: NavPoint2): number {
  const abX = end[0] - start[0]
  const abZ = end[1] - start[1]
  const apX = point[0] - start[0]
  const apZ = point[1] - start[1]
  const lengthSquared = abX * abX + abZ * abZ
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (apX * abX + apZ * abZ) / lengthSquared))
  const dx = point[0] - (start[0] + abX * t)
  const dz = point[1] - (start[1] + abZ * t)
  return dx * dx + dz * dz
}

export function isPointBlocked(point: NavPoint2, blocker: NavigationBlocker): boolean {
  if (blocker.kind === 'circle') {
    const dx = point[0] - blocker.center[0]
    const dz = point[1] - blocker.center[1]
    return dx * dx + dz * dz <= blocker.radius * blocker.radius
  }

  if (blocker.kind === 'orientedRect') {
    const dx = point[0] - blocker.center[0]
    const dz = point[1] - blocker.center[1]
    // `rotation` is the SAME value passed to the prefab's three.js `rotation-y`.
    // three.js `Ry(θ)` maps world→local by rotating −θ, so we must NOT negate here
    // — negating mirrors the rect and the nav hole ends up rotated opposite to the
    // visible building (bulging into open ground on strongly-rotated prefabs).
    const cosine = Math.cos(blocker.rotation)
    const sine = Math.sin(blocker.rotation)
    const localX = dx * cosine - dz * sine
    const localZ = dx * sine + dz * cosine
    return Math.abs(localX) <= blocker.halfSize[0] && Math.abs(localZ) <= blocker.halfSize[1]
  }

  for (let index = 1; index < blocker.points.length; index += 1) {
    if (distanceToSegmentSquared(point, blocker.points[index - 1], blocker.points[index]) <= blocker.halfWidth * blocker.halfWidth) {
      return true
    }
  }
  return false
}

export function isNavigationPointWalkable(descriptor: NavigationSurfaceDescriptor, point: NavPoint2): boolean {
  const { bounds } = descriptor
  if (point[0] < bounds.minX || point[0] > bounds.maxX || point[1] < bounds.minZ || point[1] > bounds.maxZ) return false
  return !descriptor.blockers.some((blocker) => isPointBlocked(point, blocker))
}

export function withNavigationBlockers(
  descriptor: NavigationSurfaceDescriptor,
  blockers: readonly NavigationBlocker[],
  id = descriptor.id,
): NavigationSurfaceDescriptor {
  return { ...descriptor, id, blockers: [...descriptor.blockers, ...blockers] }
}
