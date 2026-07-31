import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { ReactNode } from 'react'

import { advanceFixedStep, createFixedStepState } from './fixedStep'
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
export function FixedTickClock({ bus, stepHz = 30 }: {
  readonly bus: FixedTickBus
  readonly stepHz?: number
}) {
  const clock = useRef(createFixedStepState())
  const stepSeconds = 1 / stepHz

  useFrame((_, deltaSeconds) => {
    const advance = advanceFixedStep(clock.current, deltaSeconds * 1_000, { stepHz }, document.hidden)
    if (advance.state.frozen) {
      clock.current = createFixedStepState()
      return
    }
    clock.current = advance.state
    for (let step = 0; step < advance.steps; step += 1) bus.emit(stepSeconds)
  })

  return null
}
