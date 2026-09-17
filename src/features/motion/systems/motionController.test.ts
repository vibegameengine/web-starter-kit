import { describe, expect, it } from 'vitest'

import { createBoxWorldTrace, type SolidBox, type Vector3Tuple } from './boxTrace'
import { IDLE_MOTION_INTENT, type MotionIntent } from './motionIntent'
import { GROUNDED_MOTION_PROFILE } from './motionProfile'
import {
  createMotionState,
  stepMotionController,
  type MotionSettings,
  type MotionState,
} from './motionController'
import { HUMAN_TURN_PROFILE } from './turnDynamics'

const STEP = 1 / 60
const HALF_EXTENTS: Vector3Tuple = [0.3, 0.9, 0.3]
const FLOOR: SolidBox = { center: [0, -1, 0], halfExtents: [30, 1, 30] }
const SLAB: SolidBox = { center: [0, 0.15, 4], halfExtents: [6, 0.15, 2] }

function settingsFor(solids: readonly SolidBox[], rotationMode: MotionSettings['rotationMode']): MotionSettings {
  return {
    halfExtents: HALF_EXTENTS,
    profile: GROUNDED_MOTION_PROFILE,
    rotationMode,
    trace: createBoxWorldTrace(solids),
    turnProfile: HUMAN_TURN_PROFILE,
  }
}

function standing(position: Vector3Tuple = [0, 0.9, 0]): MotionState {
  return { ...createMotionState(position), mode: 'walking' }
}

function drive(state: MotionState, intent: MotionIntent, settings: MotionSettings, steps: number, aimYaw = 0): MotionState {
  let current = state
  for (let index = 0; index < steps; index += 1) {
    current = stepMotionController({ aimYaw, delta: STEP, intent, settings, state: current })
  }
  return current
}

describe('stepMotionController', () => {
  it('walks a grounded body forward along its yaw', () => {
    const settings = settingsFor([FLOOR], 'orient-to-movement')
    const state = drive(standing(), { ...IDLE_MOTION_INTENT, forward: 1 }, settings, 60)

    expect(state.mode).toBe('walking')
    expect(state.moving).toBe(true)
    expect(state.position[2]).toBeGreaterThan(2)
    expect(state.position[1]).toBeCloseTo(0.9, 2)
    expect(state.locomotionDirection).toBe('forward')
  })

  it('accumulates the distance travelled, which is what drives a stride', () => {
    const settings = settingsFor([FLOOR], 'orient-to-movement')
    const state = drive(standing(), { ...IDLE_MOTION_INTENT, forward: 1 }, settings, 60)

    expect(state.travelledMeters).toBeCloseTo(state.position[2] - 0, 2)
    expect(state.travelledMeters).toBeGreaterThan(2)
  })

  it('falls when there is nothing underneath', () => {
    const settings = settingsFor([], 'orient-to-movement')
    const state = drive(standing(), IDLE_MOTION_INTENT, settings, 30)

    expect(state.mode).toBe('falling')
    expect(state.position[1]).toBeLessThan(0.9)
  })

  it('lands back on the floor after a jump', () => {
    const settings = settingsFor([FLOOR], 'orient-to-movement')
    const jumped = drive(standing(), { ...IDLE_MOTION_INTENT, jump: true }, settings, 6)
    expect(jumped.mode).toBe('falling')

    const landed = drive(jumped, IDLE_MOTION_INTENT, settings, 120)
    expect(landed.mode).toBe('walking')
    expect(landed.position[1]).toBeCloseTo(0.9, 2)
  })

  it('climbs a step while walking into it', () => {
    const settings = settingsFor([FLOOR, SLAB], 'orient-to-movement')
    const state = drive(standing(), { ...IDLE_MOTION_INTENT, forward: 1 }, settings, 120)

    expect(state.position[1]).toBeCloseTo(1.2, 2)
    expect(state.mode).toBe('walking')
  })

  it('turns the body onto the aim when the rotation follows it', () => {
    const settings = settingsFor([FLOOR], 'follow-aim')
    const state = drive(standing(), IDLE_MOTION_INTENT, settings, 120, Math.PI / 2)

    expect(state.bodyFacingRadians).toBeCloseTo(Math.PI / 2, 3)
  })

  it('reports a strafe as a sideways stride when the body holds its aim', () => {
    const settings = settingsFor([FLOOR], 'follow-aim')
    const state = drive(standing(), { ...IDLE_MOTION_INTENT, right: 1 }, settings, 60)

    expect(state.locomotionDirection).toBe('right')
    expect(state.bodyFacingRadians).toBeCloseTo(0, 3)
  })

  it('keeps the aim inside the spine limit while the legs catch up', () => {
    const settings = settingsFor([FLOOR], 'orient-to-movement')
    const state = drive(standing(), IDLE_MOTION_INTENT, settings, 2, Math.PI)

    expect(Math.abs(state.upperAimRadians)).toBeLessThanOrEqual(HUMAN_TURN_PROFILE.upperAimLimitRadians)
  })
})
