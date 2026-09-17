import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

import { useFixedTick } from '../../../shared/lib/simulation/fixedTickContext'
import type { Vector3Tuple } from '../systems/boxTrace'
import {
  createMotionState,
  stepMotionController,
  type MotionSettings,
  type MotionState,
} from '../systems/motionController'
import type { MotionIntentSource } from './useKeyboardMotionIntent'

export type MotionTimeline = {
  readonly current: MotionState
  readonly previous: MotionState
}

export type MotionControllerOptions = {
  readonly aimYaw: MutableRefObject<number>
  readonly intent: MotionIntentSource
  readonly settings: MotionSettings
  readonly start: Vector3Tuple
}

export type MotionControllerHandle = {
  readonly timeline: MutableRefObject<MotionTimeline>
  readonly warp: (position: Vector3Tuple) => void
}

function standing(position: Vector3Tuple): MotionState {
  return { ...createMotionState(position), mode: 'walking' }
}

export function useMotionController({
  aimYaw,
  intent,
  settings,
  start,
}: MotionControllerOptions): MotionControllerHandle {
  const initial = standing(start)
  const timeline = useRef<MotionTimeline>({ current: initial, previous: initial })
  const pendingWarp = useRef<Vector3Tuple | null>(null)

  const ticked = useFixedTick((delta) => {
    const queued = pendingWarp.current
    if (queued) {
      pendingWarp.current = null
      const placed = standing(queued)
      timeline.current = { current: placed, previous: placed }
      return
    }

    const yaw = aimYaw.current
    const state = stepMotionController({
      aimYaw: yaw,
      delta,
      intent: intent.read(yaw),
      settings,
      state: timeline.current.current,
    })
    timeline.current = { current: state, previous: timeline.current.current }
  })

  useEffect(() => {
    if (!ticked && import.meta.env.DEV) {
      throw new Error('useMotionController found no fixed tick above it: mount it under a FixedTickProvider')
    }
  }, [ticked])

  const warp = useCallback((position: Vector3Tuple) => {
    pendingWarp.current = position
  }, [])

  return { timeline, warp }
}
