import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { ReactNode } from 'react'

import { advanceFixedStep, createFixedStepState } from './fixedStep'
import { interpolationAlpha } from './renderInterpolation'
import type { FixedTickBus } from './fixedTickBus'
import { FixedTickContext } from './fixedTickContext'

/**
 * The two components of the fixed-tick connector. The context, the hook and the
 * reasoning behind them live in `fixedTickContext.ts`.
 */

export function FixedTickProvider({ bus, children }: {
  readonly bus: FixedTickBus
  readonly children: ReactNode
}) {
  return <FixedTickContext.Provider value={bus}>{children}</FixedTickContext.Provider>
}

/**
 * A fixed clock for a host that has none of its own.
 *
 * The ragdoll bench has no player, no session and no simulation — only a body
 * and the ground it lands on — so there is nothing there to hang a tick off.
 * This is that scene's FIRST clock, not a second one: mount it exactly where no
 * other fixed step exists, and never alongside one.
 */
export function FixedTickClock({ bus, paused = false, stepHz = 30 }: {
  readonly bus: FixedTickBus
  /**
   * Stops the simulation without unmounting it.
   *
   * Routed through the SAME freeze the hidden-tab case already uses rather than
   * a second branch: that path resets the accumulator and pins alpha to 1, so a
   * pause holds the last solved pose instead of sliding on towards a tick that
   * never ran. A pause that skipped only the `emit` would bank every paused
   * second and replay them all at once on resume.
   */
  readonly paused?: boolean
  readonly stepHz?: number
}) {
  const clock = useRef(createFixedStepState())
  const stepSeconds = 1 / stepHz

  useFrame((_, deltaSeconds) => {
    const advance = advanceFixedStep(clock.current, deltaSeconds * 1_000, { stepHz }, document.hidden || paused)
    if (advance.state.frozen) {
      clock.current = createFixedStepState()
      // A frozen clock has no "part way to the next step" to report. Holding the
      // last solved pose is right; sliding on towards a step that never ran is
      // not.
      bus.setAlpha(1)
      return
    }
    clock.current = advance.state
    for (let step = 0; step < advance.steps; step += 1) bus.emit(stepSeconds)
    // Published AFTER the steps: what is left in the accumulator now is exactly
    // how far past the newest tick this frame sits.
    bus.setAlpha(interpolationAlpha(advance.state.accumulatorMs, stepHz))
  })

  return null
}
