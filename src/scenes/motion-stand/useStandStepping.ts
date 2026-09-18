import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { Object3D } from 'three'

import type { MotionTimeline } from '../../features/motion/components/useMotionController'
import type { FixedTickBus } from '../../shared/lib/simulation/fixedTickBus'
import { MOTION_STAND_STEP_EVENT, type StandStore } from './motionStandStore'
import { readStand } from './standReadout'

export const STAND_STEP_SECONDS = 1 / 60

export type StandSteppingOptions = {
  readonly bus: FixedTickBus
  readonly frame: MutableRefObject<number>
  readonly invalidate: () => void
  readonly readout: StandStore
  readonly rig: Object3D
  readonly timeline: MutableRefObject<MotionTimeline>
}

/* @important A reset is not handled here: the scene remounts the whole subject
   on it, so the controller, the animator, the mixer and the legs all start
   from nothing. A warp kept the animator's phase, the pose search and every
   foot lock, and two runs of the same course from the same reset differed by
   13 cm. The subject steps once on mount, which is the frame a reset shows. */
export function useStandStepping(options: StandSteppingOptions): void {
  const { bus, frame, invalidate, readout, rig, timeline } = options

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

    window.addEventListener(MOTION_STAND_STEP_EVENT, onStep)
    const first = requestAnimationFrame(() => advance(1))
    return () => {
      cancelAnimationFrame(first)
      window.removeEventListener(MOTION_STAND_STEP_EVENT, onStep)
    }
  }, [bus, frame, invalidate, readout, rig, timeline])
}
