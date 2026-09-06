import { useCallback, useEffect, useRef, useState } from 'react'

import { advanceFixedStep, createFixedStepState } from '../../../shared/lib/simulation'
import { LoopbackTransport } from '../../../shared/net'

const SHOWCASE_PULSE_EVENT = 71
const SHOWCASE_ROOM = 'starter-showcase'

/**
 * Real two-tab loopback showcase. Gameplay remains unaware of this DEV/demo aid.
 *
 * The tick is handed back as a REF, not as state. It advances sixty times a
 * second, and a `useState` for it would re-render every consumer of this hook at
 * 60 Hz to move one number — which is the cost the `no-restricted-syntax` rule
 * in `eslint.config.js` exists to stop. Read it from a `useFrame`, or write it
 * straight to a DOM node; do not put it back into React state on the way to the
 * screen.
 */
export function useStarterShowcaseSync() {
  const transportRef = useRef<LoopbackTransport | null>(null)
  /* eslint-disable no-restricted-syntax -- both are events, not readings: a peer
     joining or leaving, and a pulse arriving from the other tab. Each one has to
     reach the screen, and neither is written per frame. */
  const [peerCount, setPeerCount] = useState(0)
  const [pulseId, setPulseId] = useState(0)
  /* eslint-enable no-restricted-syntax */
  const fixedTickRef = useRef(0)

  useEffect(() => {
    const transport = new LoopbackTransport(SHOWCASE_ROOM)
    transportRef.current = transport
    transport.connect({
      onActorsChange: (actors) => setPeerCount(Math.max(0, actors.length - 1)),
      onEvent: (code) => {
        if (code === SHOWCASE_PULSE_EVENT) setPulseId((value) => value + 1)
      },
    })

    return () => {
      transport.disconnect()
      transportRef.current = null
    }
  }, [])

  useEffect(() => {
    let state = createFixedStepState()
    let previousTime = performance.now()
    let frame = 0

    const advance = (time: number) => {
      const next = advanceFixedStep(state, time - previousTime, { stepHz: 60 })
      state = next.state
      previousTime = time
      if (next.steps > 0) fixedTickRef.current = (fixedTickRef.current + next.steps) % 60
      frame = requestAnimationFrame(advance)
    }

    frame = requestAnimationFrame(advance)
    return () => cancelAnimationFrame(frame)
  }, [])

  const openMirror = useCallback(() => {
    const mirror = new URL(window.location.href)
    mirror.searchParams.set('showcase', 'mirror')
    window.open(mirror, '_blank', 'noopener')
  }, [])

  const sendPulse = useCallback(() => {
    transportRef.current?.raiseEvent(SHOWCASE_PULSE_EVENT, null, 'all')
  }, [])

  return { fixedTickRef, openMirror, peerCount, pulseId, sendPulse }
}
