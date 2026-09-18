export type SpringState = {
  readonly value: number
  readonly velocity: number
}

export type Spring = {
  readonly damping: number
  readonly stiffness: number
}

export const DEFAULT_PLANT_SPRING: Spring = { damping: 1, stiffness: 220 }

/* @important A linear ramp reaches its target carrying whatever speed it had
   and stops dead, which the eye reads as a jerk — that is what the plant offset
   did on release. A damped spring arrives with its velocity already spent, and
   keeps the velocity it had when the target moves, so nothing in the pose has a
   corner in it. Unreal springs the same offset for the same reason.

   The step is the implicit one rather than the obvious explicit one: an
   explicit spring stiff enough to hold a plant explodes at a long frame, and a
   long frame is exactly what a hitch is. */
export function springStep(state: SpringState, target: number, spring: Spring, deltaSeconds: number): SpringState {
  if (deltaSeconds <= 0) return state
  const frequency = Math.sqrt(Math.max(0, spring.stiffness))
  const factor = 1 + 2 * deltaSeconds * spring.damping * frequency
  const squared = frequency * frequency
  const stepSquared = deltaSeconds * deltaSeconds * squared
  const determinant = factor + stepSquared
  const velocity = (state.velocity + deltaSeconds * squared * (target - state.value)) / determinant
  return { value: state.value + deltaSeconds * velocity, velocity }
}
