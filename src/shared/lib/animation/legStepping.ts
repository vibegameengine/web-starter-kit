/**
 * Where a foot should BE, when the body is moving in a direction the take was
 * never captured for.
 *
 * A run take is a recording of a body going forward. Play it while the body
 * strafes and the feet keep striding forward through a world that is sliding
 * sideways underneath them — the legs are busy, the animal skates. The usual
 * answer is more takes: a strafe-left, a strafe-right, a back-pedal, and a blend
 * tree to pick between them. That is four captures per creature and it still has
 * nothing to say about the diagonals.
 *
 * The other answer is to stop asking the take where the feet go. A foot is
 * PLANTED at a spot on the ground; it stays at that spot, in world space, while
 * the body moves over it; when the body has carried the leg too far from where
 * that leg wants to be, the foot picks up, arcs, and lands somewhere ahead. That
 * works in every direction because no direction is baked into it — this is the
 * whole of it, and it is why the module is pure arithmetic with no three.js in
 * sight.
 *
 * The gait comes out of one extra rule: legs step in DIAGONAL PAIRS, and only
 * one pair is ever off the ground. That is a trot, it is what most quadrupeds do
 * at moderate speed, and it keeps the animal statically balanced at every
 * instant — there is always a support triangle. Without the rule the legs step
 * whenever they individually feel like it, and a dog whose four feet lift in
 * arbitrary order reads as broken long before anyone can say why.
 */

/** A point on the ground plane. Y is carried but never reasoned about here. */
export type StepPoint = { x: number; y: number; z: number }

export type LegStepState = {
  /** Where this foot is planted right now, in world space. */
  readonly planted: StepPoint
  /** Where the step started, valid while `stepping`. */
  readonly from: StepPoint
  /** 0 when standing, otherwise how far through the step we are, 0..1. */
  readonly phase: number
  readonly stepping: boolean
  /** Where the step is going, valid while `stepping`. */
  readonly to: StepPoint
}

export type LegStepSettings = {
  /**
   * How high the foot arcs at the middle of a step, in metres.
   *
   * Not a fraction of anything: it is a clearance, and clearance is about the
   * ground rather than about the animal. A creature twice the size crossing the
   * same doorstep lifts its foot the same distance.
   */
  readonly arcHeight: number
  /**
   * How far ahead of the home position the foot lands, as a multiple of the
   * distance the body covers during one step.
   *
   * Landing exactly on home means the foot is already behind by the time it
   * touches down, and it spends the whole stance being dragged. Landing ahead
   * puts the stance in the middle of the leg's range, which is where a leg has
   * the most room to push from.
   */
  readonly leadFactor: number
  /**
   * How far the body may carry a leg from its home position before that leg has
   * to step, in metres.
   *
   * The one number that decides whether this reads as walking or as shuffling.
   * Too small and the feet chatter; too large and the legs stretch out behind
   * the body like a dog being dragged on a lead.
   */
  readonly strideThreshold: number
  /** How long one step takes, in seconds. */
  readonly stepSeconds: number
}

export const DEFAULT_LEG_STEP_SETTINGS: LegStepSettings = {
  arcHeight: 0.09,
  leadFactor: 0.65,
  stepSeconds: 0.22,
  strideThreshold: 0.28,
}

/** The four legs, in the order a caller supplies them. */
export type LegIndex = 0 | 1 | 2 | 3

/**
 * Which legs may lift together.
 *
 * Index order is front-left, front-right, back-left, back-right — the order the
 * leg table is written in — so the diagonals are (0,3) and (1,2). A caller with
 * a different order gets a different gait, which is why the order is documented
 * at the table rather than inferred here.
 */
export const DIAGONAL_PAIRS: readonly (readonly [LegIndex, LegIndex])[] = [
  [0, 3],
  [1, 2],
]

function distanceOnGround(a: StepPoint, b: StepPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/**
 * How far past its limit the worst leg of a pair has been carried.
 *
 * A pair steps on the WORST of its two legs rather than on the average: the
 * average lets one leg sit far past its limit as long as the other one is fine,
 * and a single leg trailing behind the body is exactly the thing being avoided.
 */
export function pairStrain(
  pair: readonly [LegIndex, LegIndex],
  planted: readonly StepPoint[],
  home: readonly StepPoint[],
): number {
  return Math.max(distanceOnGround(planted[pair[0]], home[pair[0]]), distanceOnGround(planted[pair[1]], home[pair[1]]))
}

/**
 * Where a foot in mid-step is at this instant.
 *
 * The horizontal path is a straight line and the vertical one is half a sine —
 * zero at both ends, `arcHeight` in the middle. Easing the horizontal too was
 * tried and looked worse: a foot that slows as it lands reads as hesitant,
 * while a foot travelling at a constant rate under a smooth lift reads as
 * deliberate.
 */
export function stepPosition(state: LegStepState, arcHeight: number): StepPoint {
  const t = Math.min(1, Math.max(0, state.phase))
  return {
    x: state.from.x + (state.to.x - state.from.x) * t,
    y: state.from.y + (state.to.y - state.from.y) * t + Math.sin(Math.PI * t) * arcHeight,
    z: state.from.z + (state.to.z - state.from.z) * t,
  }
}

/**
 * Where a stepping foot should land.
 *
 * `home` is where this leg wants to be for the body's CURRENT position, and the
 * lead term adds where the body will have got to by the time the foot arrives.
 * Without it every landing is already stale — the body has moved on during the
 * step, so the foot touches down behind where it was aiming and immediately
 * starts the next one. That produces a visible stutter at exactly the speeds a
 * creature spends most of its time at.
 */
export function stepTarget(
  home: StepPoint,
  velocity: { readonly x: number; readonly z: number },
  settings: LegStepSettings,
): StepPoint {
  const lead = settings.stepSeconds * settings.leadFactor
  return { x: home.x + velocity.x * lead, y: home.y, z: home.z + velocity.z * lead }
}

export type LegStepAdvance = {
  /** Which pair, if any, was told to lift on this tick. */
  readonly lifting: readonly [LegIndex, LegIndex] | null
  readonly states: readonly LegStepState[]
}

/**
 * One tick of the whole gait.
 *
 * Every leg in flight is advanced, and then — only if NO leg is in flight — the
 * more strained diagonal pair is allowed to lift. Checking that nothing is
 * airborne before starting anything is what keeps the trot honest: the two pairs
 * cannot overlap, so three feet are always down, and the animal cannot get into
 * the state where it is briefly standing on one leg because two independent
 * timers happened to line up.
 */
export function advanceLegSteps(
  states: readonly LegStepState[],
  home: readonly StepPoint[],
  velocity: { readonly x: number; readonly z: number },
  deltaSeconds: number,
  settings: LegStepSettings,
): LegStepAdvance {
  const next = states.map((state) => {
    if (!state.stepping) return state
    const phase = state.phase + deltaSeconds / Math.max(1e-3, settings.stepSeconds)
    if (phase >= 1) {
      return { from: state.to, phase: 0, planted: state.to, stepping: false, to: state.to }
    }
    return { ...state, phase }
  })

  if (next.some((state) => state.stepping)) return { lifting: null, states: next }

  let worst: readonly [LegIndex, LegIndex] | null = null
  let worstStrain = settings.strideThreshold
  for (const pair of DIAGONAL_PAIRS) {
    const strain = pairStrain(pair, next.map((s) => s.planted), home)
    if (strain > worstStrain) {
      worst = pair
      worstStrain = strain
    }
  }
  if (!worst) return { lifting: null, states: next }

  const lifted = next.slice()
  for (const index of worst) {
    lifted[index] = {
      from: next[index].planted,
      phase: 0,
      planted: next[index].planted,
      stepping: true,
      to: stepTarget(home[index], velocity, settings),
    }
  }
  return { lifting: worst, states: lifted }
}
