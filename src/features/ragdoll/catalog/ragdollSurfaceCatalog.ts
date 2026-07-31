import type { ComponentType } from 'react'

import {
  CarriedSurfaceSample,
  FlatSurfaceSample,
  LedgeSurfaceSample,
  ObstaclesSurfaceSample,
  SlopeSurfaceSample,
  StepsSurfaceSample,
  type SurfaceSampleProps,
} from '../samples/surfaceSamples'

/**
 * The surface studies, in the order they are worth walking through: the baseline
 * first, then one departure from it at a time. Each is inspected on its own — a
 * body that lands between two features tells you nothing about either.
 */
type RagdollSurfaceSample = {
  readonly Component: ComponentType<SurfaceSampleProps>
  readonly id: 'carried' | 'flat' | 'ledge' | 'obstacles' | 'slope' | 'steps'
  readonly label: string
}

export const ragdollSurfaceSamples: readonly RagdollSurfaceSample[] = [
  { id: 'flat', label: 'Flat', Component: FlatSurfaceSample },
  { id: 'steps', label: 'Steps', Component: StepsSurfaceSample },
  { id: 'slope', label: 'Slope', Component: SlopeSurfaceSample },
  { id: 'ledge', label: 'Ledge', Component: LedgeSurfaceSample },
  { id: 'obstacles', label: 'Obstacles', Component: ObstaclesSurfaceSample },
  // Last, because it is not a kind of ground: it is the raid's own scene graph,
  // where the body is carried by a group rather than standing on the world.
  { id: 'carried', label: 'Carried', Component: CarriedSurfaceSample },
]

export type RagdollSurfaceId = RagdollSurfaceSample['id']

export function ragdollSurfaceFrom(value: string | null): RagdollSurfaceSample {
  return ragdollSurfaceSamples.find((sample) => sample.id === value) ?? ragdollSurfaceSamples[0]
}
