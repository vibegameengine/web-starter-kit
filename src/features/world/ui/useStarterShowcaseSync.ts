import { useCallback, useEffect, useRef, useState } from 'react'

import { advanceFixedStep, createFixedStepState } from '../../../shared/lib/simulation'
import { LoopbackTransport } from '../../../shared/net'

const SHOWCASE_PULSE_EVENT = 71
const SHOWCASE_ROOM = 'starter-showcase'

/** Real two-tab loopback showcase. Gameplay remains unaware of this DEV/demo aid. */
export function useStarterShowcaseSync() {
  const transportRef = useRef<LoopbackTransport | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [pulseId, setPulseId] = useState(0)
  const [fixedTick, setFixedTick] = useState(0)

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
      if (next.steps > 0) setFixedTick((value) => (value + next.steps) % 60)
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

  return { fixedTick, openMirror, peerCount, pulseId, sendPulse }
}
