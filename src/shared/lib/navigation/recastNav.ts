import { Crowd, NavMesh, init } from 'recast-navigation'
import { threeToSoloNavMesh } from '@recast-navigation/three'
import type { Mesh } from 'three'

let initPromise: Promise<void> | null = null

export type NavigationRuntime = {
  crowd: Crowd
  navMesh: NavMesh
}

export type NavBakeParams = NonNullable<Parameters<typeof threeToSoloNavMesh>[1]>

const defaultParams: NavBakeParams = {
  cs: 0.3,
  ch: 0.2,
  walkableSlopeAngle: 45,
  walkableHeight: 2,
  walkableClimb: 0.4,
  walkableRadius: 0.35,
  maxEdgeLen: 12,
  maxSimplificationError: 1.3,
  minRegionArea: 4,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
}

/** Initializes Recast once before baking navigation. */
export function ensureRecast(): Promise<void> {
  initPromise ??= init().then(() => undefined)
  return initPromise
}

/** Builds a Recast navmesh and crowd from caller-owned walkable meshes. */
export function buildMeshNavigation(meshes: Mesh[], params?: Partial<NavBakeParams>): NavigationRuntime | null {
  const result = threeToSoloNavMesh(meshes, { ...defaultParams, ...params })
  if (!result.success || !result.navMesh) return null

  return {
    crowd: new Crowd(result.navMesh, { maxAgents: 64, maxAgentRadius: 1 }),
    navMesh: result.navMesh,
  }
}
