export const UNPLANT_ANGLE = (45 * Math.PI) / 180
export const UNPLANT_RADIUS = 0.35

export function yawBetween(from: number, to: number): number {
  const turn = (to - from) % (2 * Math.PI)
  if (turn > Math.PI) return turn - 2 * Math.PI
  if (turn < -Math.PI) return turn + 2 * Math.PI
  return turn
}

export function footYaw(ankle: readonly [number, number, number], toe: readonly [number, number, number]): number {
  return Math.atan2(toe[0] - ankle[0], toe[2] - ankle[2])
}

export function twistHold(twistRadians: number): number {
  return Math.abs(twistRadians) > UNPLANT_ANGLE ? 0 : 1
}

export function radiusHold(gapMeters: number): number {
  return gapMeters > UNPLANT_RADIUS ? 0 : 1
}

export const REPLANT_RADIUS = UNPLANT_RADIUS * 0.35

export function shouldReplant(gapToLock: number, hold: number): boolean {
  return gapToLock * hold <= REPLANT_RADIUS
}
