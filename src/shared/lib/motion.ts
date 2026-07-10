/**
 * Character motion — the ECS "systems" layer: pure, frame-independent math with
 * no React and no three. Given elapsed time it returns transforms, so the logic
 * stays unit-testable. The hooks in `../components` apply the result to an
 * entity's ref every frame.
 */

export interface SpinOptions {
  /** Revolutions per second. */
  speed?: number
}

/** Y-rotation (radians) for a steady spin at `speed` rev/s after `elapsed` seconds. */
export function spinAngle(elapsed: number, { speed = 0.25 }: SpinOptions = {}): number {
  return elapsed * speed * Math.PI * 2
}

export interface BobOptions {
  /** Peak vertical offset from `base`, in world units. */
  amplitude?: number
  /** Bobs per second. */
  frequency?: number
  /** Resting height the bob oscillates around. */
  base?: number
}

/** Vertical position for a sine bob at time `elapsed`. */
export function bobHeight(
  elapsed: number,
  { amplitude = 0.15, frequency = 1, base = 0 }: BobOptions = {},
): number {
  return base + Math.sin(elapsed * frequency * Math.PI * 2) * amplitude
}
