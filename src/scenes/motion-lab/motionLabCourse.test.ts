import { describe, expect, it } from 'vitest'

import { createBoxWorldTrace, type Vector3Tuple } from '../../features/motion/systems/boxTrace'
import { GROUNDED_MOTION_PROFILE } from '../../features/motion/systems/motionProfile'
import { stepSlideMove, type SlideBody } from '../../features/motion/systems/slideMove'
import { MOTION_LAB_SOLIDS, MOTION_LAB_STATIONS, MOTION_LAB_STEP_HEIGHTS } from './motionLabCourse'

const HALF_EXTENTS: Vector3Tuple = [0.3, 0.9, 0.3]
const STEP = 1 / 60
const WALK_SPEED = GROUNDED_MOTION_PROFILE.maxSpeed

function stationPosition(id: string): Vector3Tuple {
  const station = MOTION_LAB_STATIONS.find((candidate) => candidate.id === id)
  if (!station) throw new Error(`no such lab station: ${id}`)
  return station.position
}

function walkForward(start: Vector3Tuple, steps: number): SlideBody {
  const context = {
    delta: STEP,
    gravity: GROUNDED_MOTION_PROFILE.gravity,
    profile: GROUNDED_MOTION_PROFILE,
    trace: createBoxWorldTrace(MOTION_LAB_SOLIDS),
  }
  let body: SlideBody = {
    groundNormal: [0, 1, 0],
    halfExtents: HALF_EXTENTS,
    onGround: true,
    position: start,
    velocity: [0, 0, WALK_SPEED],
  }
  for (let index = 0; index < steps; index += 1) {
    body = stepSlideMove({ ...body, velocity: [0, body.velocity[1], WALK_SPEED] }, context)
  }
  return body
}

describe('motion lab course', () => {
  it('lifts the body onto every step the profile can climb', () => {
    const climbable = MOTION_LAB_STEP_HEIGHTS.filter((height) => height <= GROUNDED_MOTION_PROFILE.maxStepHeight)

    for (const height of climbable) {
      const id = `step-${String(Math.round(height * 100)).padStart(3, '0')}`
      const body = walkForward(stationPosition(id), 60)
      expect({ height, y: Number(body.position[1].toFixed(2)) }).toEqual({ height, y: Number((0.9 + height).toFixed(2)) })
    }
  })

  it('refuses the step above the profile height', () => {
    const body = walkForward(stationPosition('step-060'), 60)

    expect(body.position[1]).toBeCloseTo(0.9, 2)
    expect(body.position[2]).toBeLessThan(0)
  })
})
