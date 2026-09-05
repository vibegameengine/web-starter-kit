import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'

import { solveTwoBoneIk } from './twoBoneIk'

/** A leg: 0.4 m thigh, 0.45 m shin, hip at the origin, knee bending forward. */
const LEG = { lowerLength: 0.45, upperLength: 0.4 }
const HIP = new Vector3(0, 0, 0)
const KNEE = new Vector3(0, -0.4, 0.05)
const FORWARD = new Vector3(0, 0, 1)

/** Bone lengths are the invariant: a solver that breaks them is stretching the leg. */
function lengths(root: Vector3, mid: Vector3, tip: Vector3) {
  return { lower: mid.distanceTo(tip), upper: root.distanceTo(mid) }
}

describe('solveTwoBoneIk', () => {
  it('puts the tip on a target the chain can reach', () => {
    const target = new Vector3(0, -0.6, 0.2)
    const solved = solveTwoBoneIk(HIP, KNEE, target, LEG, FORWARD)
    expect(solved.tip.distanceTo(target)).toBeLessThan(1e-6)
    expect(solved.reached).toBe(1)
  })

  it('keeps both bones exactly as long as they were', () => {
    // The one thing a solver must never do is stretch the limb, and it is the one
    // failure that looks like a rig problem rather than a solver problem.
    for (const target of [new Vector3(0, -0.5, 0.3), new Vector3(0.2, -0.7, 0), new Vector3(0, -0.2, 0.1)]) {
      const solved = solveTwoBoneIk(HIP, KNEE, target, LEG, FORWARD)
      const { lower, upper } = lengths(HIP, solved.mid, solved.tip)
      expect(upper).toBeCloseTo(LEG.upperLength, 5)
      expect(lower).toBeCloseTo(LEG.lowerLength, 5)
    }
  })

  it('points at a target it cannot reach instead of stretching to it', () => {
    const target = new Vector3(0, -3, 0)
    const solved = solveTwoBoneIk(HIP, KNEE, target, LEG, FORWARD)
    const { lower, upper } = lengths(HIP, solved.mid, solved.tip)
    expect(upper).toBeCloseTo(LEG.upperLength, 5)
    expect(lower).toBeCloseTo(LEG.lowerLength, 5)
    // Straight down, at its own reach — not at the target.
    expect(solved.tip.length()).toBeCloseTo((LEG.upperLength + LEG.lowerLength) * 0.999, 4)
    // And it SAYS it did not reach, which is what a caller needs to know.
    expect(solved.reached).toBeLessThan(1)
  })

  it('never fully straightens, so the bend plane stays defined', () => {
    // At exactly straight, every direction is an equally valid knee. A target
    // beyond reach must not push the chain to that point.
    const solved = solveTwoBoneIk(HIP, KNEE, new Vector3(0, -10, 0), LEG, FORWARD)
    const straightness = solved.mid.distanceTo(HIP) + solved.mid.distanceTo(solved.tip)
    expect(straightness).toBeGreaterThan(solved.tip.distanceTo(HIP))
  })

  it('bends the knee toward the pole and not away from it', () => {
    const target = new Vector3(0, -0.7, 0)
    const forward = solveTwoBoneIk(HIP, KNEE, target, LEG, new Vector3(0, 0, 1))
    const backward = solveTwoBoneIk(HIP, KNEE, target, LEG, new Vector3(0, 0, -1))
    expect(forward.mid.z).toBeGreaterThan(0)
    expect(backward.mid.z).toBeLessThan(0)
  })

  it('ignores a pole that points along the limb, and keeps the current bend', () => {
    // A pole parallel to the root-to-target line says nothing about which way to
    // bend. Falling back to the CURRENT bend is what stops a limb flipping to the
    // other side for one frame when a target happens to line up.
    const target = new Vector3(0, -0.7, 0)
    const useless = new Vector3(0, -1, 0)
    const solved = solveTwoBoneIk(HIP, KNEE, target, LEG, useless)
    expect(solved.mid.z).toBeGreaterThan(0)
  })

  it('holds the pose for a target sitting on the root', () => {
    const solved = solveTwoBoneIk(HIP, KNEE, HIP.clone(), LEG, FORWARD)
    expect(solved.mid.equals(KNEE)).toBe(true)
    expect(solved.reached).toBe(0)
  })

  it('folds rather than inverting for a target inside the fold', () => {
    // Closer than the two bones can fold to. The chain must stay a triangle with
    // its own side lengths rather than turning inside out.
    const solved = solveTwoBoneIk(HIP, KNEE, new Vector3(0, -0.02, 0), LEG, FORWARD)
    const { lower, upper } = lengths(HIP, solved.mid, solved.tip)
    expect(upper).toBeCloseTo(LEG.upperLength, 5)
    expect(lower).toBeCloseTo(LEG.lowerLength, 5)
    expect(Number.isNaN(solved.mid.x)).toBe(false)
  })

  it('is deterministic — the same input twice gives the same answer', () => {
    // The reason this is closed-form rather than iterative: no convergence, so no
    // dependence on how many steps a frame could afford.
    const target = new Vector3(0.1, -0.55, 0.25)
    const first = solveTwoBoneIk(HIP, KNEE, target, LEG, FORWARD)
    const second = solveTwoBoneIk(HIP, KNEE, target, LEG, FORWARD)
    expect(first.mid.equals(second.mid)).toBe(true)
    expect(first.tip.equals(second.tip)).toBe(true)
  })
})
