import { clampNumber } from './angles'

export type LimbReach = {
  readonly desiredExtension: number
  readonly hipHeight: number
  readonly horizontalToPlant: number
  readonly limbLength: number
  readonly plantHeight: number
}

export type OffsetRange = {
  readonly desired: number
  readonly max: number
  readonly min: number
}

export const PELVIS_MAX_EXTENSION_RATIO = 0.5

export const PELVIS_MIN_EXTENSION_RATIO = 0.55

export const PELVIS_SLACK_METERS = 0.0005

export const PELVIS_MAX_OFFSET_METERS = 0.16

export function maxLimbExtension(desiredExtension: number, limbLength: number): number {
  if (desiredExtension > limbLength) return desiredExtension
  return desiredExtension + (limbLength - desiredExtension) * PELVIS_MAX_EXTENSION_RATIO
}

export function minLimbExtension(desiredExtension: number, limbLength: number): number {
  return Math.min(desiredExtension, limbLength * PELVIS_MIN_EXTENSION_RATIO)
}

/* @important Rune Johansen's construction, by way of Unreal's foot placement
   node: the height the pelvis would have to sit at for a leg of a given length
   to reach a plant is where a vertical line through the hip meets a sphere
   centred on that plant. Two spheres give two answers — the extension the
   animation already has, and the most the leg may extend — and together they
   bound how far the pelvis may travel for this one leg.

   A plant the leg cannot reach at all has no intersection, and the honest
   answer there is the closest the line comes to the sphere, not a bigger and
   bigger demand: asking for the shortfall instead fed the pelvis its own drop
   back as a reason to drop further, and a standing character folded 41 cm into
   the floor. */
function sphereOffset(limb: LimbReach, radius: number): number {
  const across = Math.min(Math.abs(limb.horizontalToPlant), radius)
  const vertical = Math.sqrt(Math.max(0, radius * radius - across * across))
  return limb.plantHeight + vertical - limb.hipHeight
}

export function limbOffsetRange(limb: LimbReach): OffsetRange {
  const desired = sphereOffset(limb, limb.desiredExtension)
  const max = sphereOffset(limb, maxLimbExtension(limb.desiredExtension, limb.limbLength))
  const folded = minLimbExtension(limb.desiredExtension, limb.limbLength)
  return { desired, max, min: limb.plantHeight + folded - limb.hipHeight - Math.abs(desired - max) }
}

/* @important One pelvis serves both legs, so the offset is the compromise
   Unreal settles on: start from the leg that wants the lowest pelvis, then give
   back a share of the distance to the loosest constraint, weighted by how far
   the average leg wanted to go.

   The clamp is Unreal's, and its argument order carries the meaning: the low
   bound is the tightest COMPRESSION any leg will accept and the high bound the
   least EXTENSION any leg will accept, and when a leg is asking for something
   impossible those two cross over. Unreal's clamp then answers the first of
   them, which is the leg that can still stand — reordering them into a tidy
   range hands the argument to the leg that cannot reach, and the body follows a
   foot hanging over a ledge down into the floor. The whole offset is then held
   inside what a pelvis may travel at all. */
export function pelvisOffset(ranges: readonly OffsetRange[]): number {
  if (ranges.length === 0) return 0
  const desiredMin = Math.min(...ranges.map((range) => range.desired))
  const maxMin = Math.min(...ranges.map((range) => range.max))
  const minMax = Math.max(...ranges.map((range) => range.min))
  const desiredAverage = ranges.reduce((sum, range) => sum + range.desired, 0) / ranges.length

  const minToAverage = desiredAverage - desiredMin
  const minToMax = maxMin - desiredMin
  const start = desiredMin - PELVIS_SLACK_METERS
  const divisor = minToAverage + minToMax
  const offset = Math.abs(divisor) < 1e-6 ? start : start + (minToAverage * minToMax) / divisor

  const bounded = offset < minMax ? minMax : Math.min(offset, maxMin)
  return clampNumber(bounded, -PELVIS_MAX_OFFSET_METERS, PELVIS_MAX_OFFSET_METERS)
}
