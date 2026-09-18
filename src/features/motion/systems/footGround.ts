import type { TraceBox, Vector3Tuple } from './boxTrace'
import { PELVIS_MAX_OFFSET_METERS } from './pelvisSolve'

export type GroundSample = {
  readonly normal: Vector3Tuple
  readonly surfaceY: number
}

export type StanceGround = {
  readonly ground: GroundSample | null
  readonly pulledX: number
  readonly pulledZ: number
}

export const GROUND_PROBE_HALF_EXTENTS: Vector3Tuple = [0.02, 0.02, 0.02]

export const GROUND_PROBE_RISE = 0.5

export const GROUND_PROBE_DROP = 0.8

export const PULL_STEPS = 4

const REACH_SHARE = 0.985

/* @important How far below its own foot a leg can still find ground: what is
   left of the leg's span once the hip is already that far above the foot, plus
   the help the pelvis can give by dropping. A fixed step limit cannot answer
   this — it said yes to a 32 cm drop beside a block with the hip 82 cm up, and
   the foot hung over the pit for ever. */
export function reachableDrop(chain: { readonly lowerLength: number; readonly upperLength: number }, hipAboveFoot: number): number {
  const span = (chain.lowerLength + chain.upperLength) * REACH_SHARE + PELVIS_MAX_OFFSET_METERS
  return Math.max(0, span - Math.max(0, hipAboveFoot))
}

export function groundUnder(point: Vector3Tuple, trace: TraceBox): GroundSample | null {
  const from: Vector3Tuple = [point[0], point[1] + GROUND_PROBE_RISE, point[2]]
  const to: Vector3Tuple = [from[0], from[1] - GROUND_PROBE_DROP, from[2]]
  const hit = trace(from, to, GROUND_PROBE_HALF_EXTENTS)
  if (!hit.hit || hit.startSolid) return null
  return {
    normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
    surfaceY: from[1] - GROUND_PROBE_DROP * hit.fraction - GROUND_PROBE_HALF_EXTENTS[1],
  }
}

/* @important A stance foot past an edge has no ground under it, or ground so
   far below that reaching for it hyper-extends the leg. Rather than let the
   solver stretch the leg into the pit, walk the probe back toward the body
   until ground within one step appears and plant on the edge. */
export function stanceGround(
  foot: Vector3Tuple,
  bodyXZ: readonly [number, number],
  trace: TraceBox,
  maxStepDrop: number,
): StanceGround {
  const direct = groundUnder(foot, trace)
  const reachable = (sample: GroundSample | null) => sample !== null && foot[1] - sample.surfaceY <= maxStepDrop
  if (reachable(direct)) return { ground: direct, pulledX: foot[0], pulledZ: foot[2] }

  for (let step = 1; step <= PULL_STEPS; step += 1) {
    const share = step / PULL_STEPS
    const x = foot[0] + (bodyXZ[0] - foot[0]) * share
    const z = foot[2] + (bodyXZ[1] - foot[2]) * share
    const pulled = groundUnder([x, foot[1], z], trace)
    if (reachable(pulled)) return { ground: pulled, pulledX: x, pulledZ: z }
  }
  return { ground: direct, pulledX: foot[0], pulledZ: foot[2] }
}
