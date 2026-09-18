import { describe, expect, it } from 'vitest'

import {
  clampOrbitPitch,
  MAX_ORBIT_DISTANCE,
  MAX_ORBIT_PITCH,
  MIN_ORBIT_DISTANCE,
  MIN_ORBIT_PITCH,
  orbitFromMouse,
  orbitOffset,
  zoomedDistance,
} from './cameraOrbit'
import { yawForward } from './motionIntent'

const LEVEL = { distance: 3, pitchRadians: 0, yawRadians: 0 }

describe('orbitOffset', () => {
  it('puts the camera behind the yaw it is given', () => {
    const offset = orbitOffset(LEVEL)
    const forward = yawForward(LEVEL.yawRadians)

    expect(offset[0]).toBeCloseTo(-forward.x * LEVEL.distance)
    expect(offset[2]).toBeCloseTo(-forward.z * LEVEL.distance)
    expect(offset[1]).toBeCloseTo(0)
  })

  it('follows the yaw round the body', () => {
    const offset = orbitOffset({ ...LEVEL, yawRadians: Math.PI / 2 })
    expect(offset[0]).toBeCloseTo(-LEVEL.distance)
    expect(offset[2]).toBeCloseTo(0)
  })

  it('keeps the distance whatever the pitch', () => {
    const offset = orbitOffset({ ...LEVEL, pitchRadians: 0.8 })
    expect(Math.hypot(offset[0], offset[1], offset[2])).toBeCloseTo(LEVEL.distance)
    expect(offset[1]).toBeGreaterThan(0)
  })
})

describe('clampOrbitPitch', () => {
  it('holds the pitch inside a range a body reads well from', () => {
    expect(clampOrbitPitch(5)).toBe(MAX_ORBIT_PITCH)
    expect(clampOrbitPitch(-5)).toBe(MIN_ORBIT_PITCH)
    expect(clampOrbitPitch(0.3)).toBeCloseTo(0.3)
  })
})

describe('zoomedDistance', () => {
  it('pulls in and pushes out within its limits', () => {
    expect(zoomedDistance(3, -1)).toBeLessThan(3)
    expect(zoomedDistance(3, 1)).toBeGreaterThan(3)
    expect(zoomedDistance(3, -100)).toBe(MIN_ORBIT_DISTANCE)
    expect(zoomedDistance(3, 100)).toBe(MAX_ORBIT_DISTANCE)
  })
})

describe('orbitFromMouse', () => {
  it('turns the camera left as the mouse goes right', () => {
    expect(orbitFromMouse(LEVEL, 100, 0).yawRadians).toBeLessThan(0)
  })

  it('raises the pitch as the mouse goes down', () => {
    expect(orbitFromMouse(LEVEL, 0, 100).pitchRadians).toBeGreaterThan(0)
  })

  it('never leaves the pitch range however far the mouse travels', () => {
    expect(orbitFromMouse(LEVEL, 0, 100000).pitchRadians).toBe(MAX_ORBIT_PITCH)
    expect(orbitFromMouse(LEVEL, 0, -100000).pitchRadians).toBe(MIN_ORBIT_PITCH)
  })

  it('leaves the distance to the wheel', () => {
    expect(orbitFromMouse(LEVEL, 50, 50).distance).toBe(LEVEL.distance)
  })
})
