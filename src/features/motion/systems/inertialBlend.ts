export type InertialCurve = {
  readonly a0: number
  readonly coefficients: readonly [number, number, number]
  readonly duration: number
  readonly value0: number
  readonly velocity0: number
}

export const DEFAULT_INERTIAL_SECONDS = 0.25

export const IDLE_INERTIAL_CURVE: InertialCurve = {
  a0: 0,
  coefficients: [0, 0, 0],
  duration: 0,
  value0: 0,
  velocity0: 0,
}

/* @important This is the transition Unreal runs on every state change and GASP
   leans on throughout: rather than crossfade two poses, take the difference the
   switch left behind and decay it to nothing. The quintic is David Bollo's —
   the one that starts at the offset with its own velocity and reaches zero with
   zero velocity and zero acceleration, so nothing in the pose jerks at either
   end. A positive velocity means the offset is growing, and is dropped; a
   negative one that would overshoot zero shortens the blend instead. */
export function inertialCurve(value0: number, velocity0: number, duration: number): InertialCurve {
  if (duration <= 1e-4 || Math.abs(value0) < 1e-6) return IDLE_INERTIAL_CURVE
  const magnitude = Math.abs(value0)
  const signedVelocity = Math.sign(value0) * velocity0
  const velocity = Math.min(0, signedVelocity)
  const span = velocity < -1e-6 ? Math.min(duration, (-5 * magnitude) / velocity) : duration
  const a0 = (-8 * velocity * span - 20 * magnitude) / (span * span)

  return {
    a0,
    coefficients: [
      -(a0 * span * span + 6 * velocity * span + 12 * magnitude) / (2 * span ** 5),
      (3 * a0 * span * span + 16 * velocity * span + 30 * magnitude) / (2 * span ** 4),
      -(3 * a0 * span * span + 12 * velocity * span + 20 * magnitude) / (2 * span ** 3),
    ],
    duration: span,
    value0: magnitude,
    velocity0: velocity,
  }
}

export function inertialValue(curve: InertialCurve, elapsed: number): number {
  if (curve.duration <= 0 || elapsed >= curve.duration) return 0
  const t = Math.max(0, elapsed)
  const [a, b, c] = curve.coefficients
  return a * t ** 5 + b * t ** 4 + c * t ** 3 + (curve.a0 / 2) * t * t + curve.velocity0 * t + curve.value0
}

export function inertialShare(curve: InertialCurve, elapsed: number): number {
  if (curve.value0 <= 1e-6) return 0
  return inertialValue(curve, elapsed) / curve.value0
}
