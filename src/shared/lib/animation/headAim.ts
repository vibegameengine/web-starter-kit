/**
 * Where the head is pointed, as two angles — the whole of the aim, with no
 * three, no bones and no frame in sight.
 *
 * Aiming a head is not "make the bone look at the point". A head that snaps onto
 * a target is a turret; a head that can reach any angle is an owl; and a head
 * driven straight from the target's position twitches whenever the target does.
 * All three are what this exists to stop, and all three are decisions about
 * ANGLES rather than about bones — so they live here, where a test can fail
 * them, rather than inside a per-frame hook where they can only be watched.
 *
 * The angles are in the BODY's frame, not the head's: yaw is measured from where
 * the imp is facing, so the constraint is "how far the head may turn off the
 * body", which is what a neck actually limits. Measuring off the head's own
 * animated orientation instead would let the limit drift with the take —  the
 * head could keep turning as long as the animation kept turning it.
 */

/** How far a head may be pushed off the body, and how fast it gets there. */
export type HeadAimLimits = {
  /** Up, in radians. Positive is looking up. */
  readonly pitchUpRadians: number
  /** Down, in radians. Given as a positive number. */
  readonly pitchDownRadians: number
  /**
   * How quickly the head closes the gap to where it wants to be, per second.
   *
   * A rate rather than a step, so the turn takes the same wall time on any
   * machine: the frame delta is what converts it. Higher is snappier; the
   * interesting range for a creature is roughly 4 (lazy, reptilian) to 14
   * (alert). Above about 25 it is a turret again.
   */
  readonly responsiveness: number
  /** Left and right, in radians, measured from the body's own facing. */
  readonly yawRadians: number
}

/**
 * What a mob's head can do. Deliberately less than a human's: this imp is a
 * hunched quadruped-ish thing whose neck is three centimetres long, and giving
 * it a human's 80 degrees of yaw made it read as a doll with a loose head.
 */
export const MOB_HEAD_AIM: HeadAimLimits = {
  pitchDownRadians: 0.62,
  pitchUpRadians: 0.42,
  responsiveness: 9,
  yawRadians: 1.05,
}

/** The head's current aim, in the body's frame. */
export type HeadAimState = {
  readonly pitchRadians: number
  readonly yawRadians: number
}

export function createHeadAimState(): HeadAimState {
  return { pitchRadians: 0, yawRadians: 0 }
}

/**
 * The angles that point at a direction given in the BODY's own space, with the
 * body facing +Z.
 *
 * Returns null for a direction with no length — a target sitting exactly on the
 * head. There is no aim for that, and the honest answer is "keep the one you
 * have" rather than a normalized zero, which is a NaN wearing a hat.
 */
export function headAimFor(x: number, y: number, z: number): HeadAimState | null {
  const length = Math.sqrt(x * x + y * y + z * z)
  if (!(length > 1e-6)) return null
  return {
    // asin of the vertical share, so pitch stays honest for a target directly
    // above: atan2(y, z) would read a target overhead as barely raised whenever
    // it was also far away.
    pitchRadians: Math.asin(Math.max(-1, Math.min(1, y / length))),
    yawRadians: Math.atan2(x, z),
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** Whether a target is inside what the neck can reach at all. */
export function headAimReaches(aim: Readonly<HeadAimState>, limits: Readonly<HeadAimLimits> = MOB_HEAD_AIM): boolean {
  return Math.abs(aim.yawRadians) <= limits.yawRadians
    && aim.pitchRadians <= limits.pitchUpRadians
    && aim.pitchRadians >= -limits.pitchDownRadians
}

/**
 * Advances the aim one FRAME toward where it wants to point.
 *
 * A frame and not a tick, on purpose: this is presentation. Nothing about the
 * game depends on where a head is pointed, and a head that moved on the
 * simulation's 30 Hz while the body was drawn at 144 would visibly step.
 *
 * `wanted` of null means there is nothing to look at — the head eases back to
 * the pose the animation gives it rather than freezing at its last angle, which
 * is the difference between a creature losing interest and a creature that has
 * died standing up.
 */
export function stepHeadAim(
  previous: Readonly<HeadAimState>,
  wanted: Readonly<HeadAimState> | null,
  deltaSeconds: number,
  limits: Readonly<HeadAimLimits> = MOB_HEAD_AIM,
): HeadAimState {
  const target: HeadAimState = wanted === null
    ? { pitchRadians: 0, yawRadians: 0 }
    : {
      pitchRadians: clamp(wanted.pitchRadians, -limits.pitchDownRadians, limits.pitchUpRadians),
      yawRadians: clamp(wanted.yawRadians, -limits.yawRadians, limits.yawRadians),
    }

  // Exponential approach, converted through the delta so the turn takes the same
  // wall time at any frame rate. Clamped at 1 because a long frame — a tab coming
  // back, a shader compile — would otherwise overshoot past the target and swing
  // back, which is a head shaking "no" every time the page hitches.
  const alpha = Math.min(1, 1 - Math.exp(-Math.max(0, deltaSeconds) * limits.responsiveness))
  return {
    pitchRadians: previous.pitchRadians + (target.pitchRadians - previous.pitchRadians) * alpha,
    yawRadians: previous.yawRadians + (target.yawRadians - previous.yawRadians) * alpha,
  }
}

/**
 * How the turn is split between the bones that carry it.
 *
 * One bone taking the whole angle is the "broken neck" look: the skull rotates
 * and the throat does not follow. Spreading it means every joint stays inside a
 * believable range and the silhouette bends instead of hinging. The shares sum
 * to one — anything else silently scales the aim, so the head would not actually
 * reach the target it was clamped to.
 */
export const MOB_HEAD_AIM_SHARE: Readonly<Record<'head' | 'neck', number>> = { head: 0.6, neck: 0.4 }
