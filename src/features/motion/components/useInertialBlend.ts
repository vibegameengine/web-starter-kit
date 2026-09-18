/* eslint-disable react-hooks/immutability -- the decaying pose offsets are
   three's own bone state, written per frame and never read during render. */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import {
  DEFAULT_INERTIAL_SECONDS,
  IDLE_INERTIAL_CURVE,
  inertialCurve,
  inertialValue,
  type InertialCurve,
} from '../systems/inertialBlend'

export type InertialBlend = {
  readonly request: (durationSeconds?: number) => void
  readonly running: () => boolean
}

type BoneTrack = {
  readonly bone: Object3D
  readonly axis: Vector3
  curve: InertialCurve
  readonly previous: Quaternion
  readonly older: Quaternion
}

const SMALLEST_OFFSET_RADIANS = 0.002

function bonesOf(rig: Object3D): readonly Object3D[] {
  const bones: Object3D[] = []
  rig.traverse((node) => {
    if ((node as { isBone?: boolean }).isBone) bones.push(node)
  })
  return bones
}

function angleAxisOf(from: Quaternion, to: Quaternion, into: Vector3): number {
  const between = from.clone().invert().premultiply(to)
  if (between.w < 0) between.set(-between.x, -between.y, -between.z, -between.w)
  const sine = Math.hypot(between.x, between.y, between.z)
  if (sine < 1e-9) {
    into.set(1, 0, 0)
    return 0
  }
  into.set(between.x / sine, between.y / sine, between.z / sine)
  return 2 * Math.atan2(sine, between.w)
}

/* @important The transition Unreal runs on every state change and GASP leans on
   throughout: rather than crossfade two poses, take the difference the switch
   left behind and decay it to nothing, per bone, with the velocity the pose
   already had. Switching a blend set outright moved a finger 60 degrees in one
   frame, which is the pop this removes. */
export function useInertialBlend(
  rig: Object3D,
  deltaSeconds: () => number,
  situation: () => string,
): InertialBlend {
  const tracks = useMemo<BoneTrack[]>(() => bonesOf(rig).map((bone) => ({
    axis: new Vector3(1, 0, 0),
    bone,
    curve: IDLE_INERTIAL_CURVE,
    older: bone.quaternion.clone(),
    previous: bone.quaternion.clone(),
  })), [rig])
  const pending = useRef(0)
  const lastSituation = useRef(situation())
  const elapsed = useRef(Number.POSITIVE_INFINITY)
  const scratch = useMemo(() => ({ axis: new Vector3(), offset: new Quaternion(), olderAxis: new Vector3() }), [])

  const startBlend = (step: number) => {
    for (const track of tracks) {
      const angle = angleAxisOf(track.bone.quaternion, track.previous, scratch.axis)
      const before = angleAxisOf(track.previous, track.older, scratch.olderAxis)
      track.axis.copy(scratch.axis)
      track.curve = Math.abs(angle) < SMALLEST_OFFSET_RADIANS
        ? IDLE_INERTIAL_CURVE
        : inertialCurve(angle, (angle - before) / step, pending.current)
    }
    elapsed.current = 0
    pending.current = 0
  }

  const rememberPose = () => {
    for (const track of tracks) {
      track.older.copy(track.previous)
      track.previous.copy(track.bone.quaternion)
    }
  }

  /* @important The change is noticed here rather than reported from outside,
     because the offset a switch leaves behind can only be measured on the frame
     it happens: this pass compares the pose it stored last frame with the pose
     the animator has just written. A request raised by another useFrame lands a
     frame late, by which time the stored pose is the new one and the offset
     measures nothing — which is exactly why the first wiring of this changed
     none of the numbers. */
  useFrame(() => {
    const step = Math.max(1e-4, deltaSeconds())
    const now = situation()
    if (now !== lastSituation.current) {
      lastSituation.current = now
      pending.current = DEFAULT_INERTIAL_SECONDS
    }
    if (pending.current > 0) startBlend(step)
    rememberPose()
    if (elapsed.current >= DEFAULT_INERTIAL_SECONDS * 4) return
    elapsed.current += step
    for (const track of tracks) {
      const angle = inertialValue(track.curve, elapsed.current)
      if (Math.abs(angle) < SMALLEST_OFFSET_RADIANS) continue
      scratch.offset.setFromAxisAngle(track.axis, angle)
      track.bone.quaternion.premultiply(scratch.offset)
    }
    rig.updateMatrixWorld(true)
  })

  return useMemo(() => ({
    request: (durationSeconds = DEFAULT_INERTIAL_SECONDS) => {
      pending.current = durationSeconds
    },
    running: () => elapsed.current < DEFAULT_INERTIAL_SECONDS * 4,
  }), [])
}
