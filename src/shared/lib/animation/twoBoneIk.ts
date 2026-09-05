import { Vector3 } from 'three'

/**
 * Two-bone inverse kinematics, solved in closed form.
 *
 * An arm or a leg is a triangle: two bones of fixed length hinged in the middle,
 * with the shoulder or hip pinned. Ask for the tip to be somewhere and there is
 * exactly one unknown left — how far the middle joint is bent — and the law of
 * cosines answers it directly. No iteration, no convergence, no per-frame budget
 * to blow: the same input gives the same output in the same time, every frame.
 *
 * That matters more than elegance here. The iterative solvers (FABRIK, CCD) are
 * general — they handle chains of any length — and general is what a leg does not
 * need. Two bones with one hinge is the case, and paying an iteration count for
 * it buys nothing but a frame-rate-dependent answer.
 *
 * Nothing here touches three's scene graph, an animation mixer or a clock. It
 * takes positions and returns a position, so it can be unit-tested against
 * arithmetic instead of against a rendered frame — which is how the rest of this
 * feature's systems are written, and for the same reason.
 *
 * WHAT IT DOES NOT DO. It solves where the middle joint goes; it does not write
 * bones. Turning a solved triangle into bone rotations belongs to whatever owns
 * the rig, because that is where the bones' rest orientations are known — and on
 * a generated rig those are arbitrary, so a solver that assumed them would work
 * on one character and quietly bend the wrong way on the next.
 */

export type TwoBoneChain = {
  /** Length of the first bone: root to mid. */
  readonly upperLength: number
  /** Length of the second bone: mid to tip. */
  readonly lowerLength: number
}

export type TwoBoneSolution = {
  /** Where the middle joint ends up. */
  readonly mid: Vector3
  /**
   * How much of the requested reach was actually met, 0 to 1.
   *
   * Below 1 the target was further than the chain can reach and the limb is
   * pointing at it, straight. A caller that wants a foot ON the ground rather
   * than reaching for it needs to know the difference — a straightened leg
   * hanging in the air is the classic IK artefact, and it is invisible unless
   * this number is looked at.
   */
  readonly reached: number
  /** Where the tip ends up: the target, or the furthest point toward it. */
  readonly tip: Vector3
}

/**
 * How far past straight the chain is allowed to go, as a fraction of its reach.
 *
 * A hair short of full extension on purpose. At exactly straight the plane the
 * limb bends in becomes undefined — every direction is equally valid for the
 * knee — so a target that crosses that point makes the joint flip to whichever
 * side floating point happened to land on. Held just inside it, the knee always
 * knows which way it is pointing.
 */
const MAX_EXTENSION = 0.999

/**
 * Solves the triangle.
 *
 * `pole` is the direction the middle joint should bend TOWARD — a knee's forward,
 * an elbow's back. It is a hint rather than a constraint: only its component
 * across the root-to-target line is used, because a pole pointing along that line
 * says nothing about which way to bend. When it says nothing usable, the previous
 * mid position is kept as the hint, which keeps a limb from snapping to a
 * different bend between two frames.
 */
export function solveTwoBoneIk(
  root: Readonly<Vector3>,
  mid: Readonly<Vector3>,
  target: Readonly<Vector3>,
  chain: Readonly<TwoBoneChain>,
  pole?: Readonly<Vector3>,
): TwoBoneSolution {
  const { lowerLength, upperLength } = chain
  const reach = upperLength + lowerLength

  const toTarget = new Vector3().subVectors(target, root)
  const distance = toTarget.length()

  // A target on top of the root has no direction to solve along. Hold the pose.
  if (distance < 1e-6 || reach < 1e-6) {
    return { mid: mid.clone(), reached: 0, tip: mid.clone() }
  }

  const axis = toTarget.clone().divideScalar(distance)
  // Clamped at both ends: further than the chain can reach, and closer than the
  // difference between the two bones, which is a target INSIDE the fold.
  const shortest = Math.abs(upperLength - lowerLength) * 1.001
  const solved = Math.min(Math.max(distance, shortest), reach * MAX_EXTENSION)
  const reached = distance <= reach * MAX_EXTENSION ? 1 : (reach * MAX_EXTENSION) / distance

  // Law of cosines: how far along the root-to-tip line the middle joint sits, and
  // how far off it.
  const along = (solved * solved + upperLength * upperLength - lowerLength * lowerLength) / (2 * solved)
  const offset = Math.sqrt(Math.max(0, upperLength * upperLength - along * along))

  // The direction the joint bends in: the pole's component ACROSS the axis, or
  // the current bend if the pole says nothing usable.
  const bend = new Vector3()
  for (const candidate of [pole, new Vector3().subVectors(mid, root), fallbackPole(axis)]) {
    if (!candidate) continue
    bend.copy(candidate).addScaledVector(axis, -candidate.dot(axis))
    if (bend.lengthSq() > 1e-8) break
  }
  bend.normalize()

  const solvedMid = new Vector3().copy(root).addScaledVector(axis, along).addScaledVector(bend, offset)
  const solvedTip = new Vector3().copy(root).addScaledVector(axis, solved)
  return { mid: solvedMid, reached, tip: solvedTip }
}

/** Any direction across the axis, for the case where nothing else offered one. */
function fallbackPole(axis: Readonly<Vector3>): Vector3 {
  const away = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  return new Vector3().crossVectors(axis, away)
}
