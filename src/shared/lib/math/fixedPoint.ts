/** Integer millimetres used by the authoritative simulation. */
export type Millimetres = number

export function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)))
}
