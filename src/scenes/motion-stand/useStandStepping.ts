import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import type { MotionTimeline } from '../../features/motion/components/useMotionController'
import type { Vector3Tuple } from '../../features/motion/systems/boxTrace'
import type { FixedTickBus } from '../../shared/lib/simulation/fixedTickBus'
import { MOTION_STAND_RESET_EVENT, MOTION_STAND_STEP_EVENT, type StandStore } from './motionStandStore'
import { readStand } from './standReadout'

export const STAND_STEP_SECONDS = 1 / 60

export type StandSteppingOptions = {
  readonly bus: FixedTickBus
  readonly frame: MutableRefObject<number>
  readonly invalidate: () => void
  readonly readout: StandStore
  readonly rig: Object3D
  readonly start: Vector3Tuple
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly warp: (position: Vector3Tuple) => void
}

export function useStandStepping(options: StandSteppingOptions): void {
  const { bus, frame, invalidate, readout, rig, start, timeline, warp } = options

  useEffect(() => {
    const publish = () => readout.publish(readStand(rig, timeline.current, frame.current))
    const advance = (count: number) => {
      for (let index = 0; index < count; index += 1) {
        bus.emit(STAND_STEP_SECONDS)
        frame.current += 1
      }
      bus.setAlpha(1)
      invalidate()
      requestAnimationFrame(publish)
    }

    const onStep = (event: Event) => advance(Math.max(1, Number((event as CustomEvent<number>).detail) || 1))
    const onReset = () => {
      frame.current = 0
      warp(start)
      advance(1)
    }

    window.addEventListener(MOTION_STAND_STEP_EVENT, onStep)
    window.addEventListener(MOTION_STAND_RESET_EVENT, onReset)
    return () => {
      window.removeEventListener(MOTION_STAND_STEP_EVENT, onStep)
      window.removeEventListener(MOTION_STAND_RESET_EVENT, onReset)
    }
  }, [bus, frame, invalidate, readout, rig, start, timeline, warp])
}
