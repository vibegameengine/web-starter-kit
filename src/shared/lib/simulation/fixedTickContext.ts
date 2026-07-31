import { createContext, useContext, useEffect, useMemo, useRef } from 'react'

import { createFixedTickBus, type FixedTickBus, type FixedTickListener } from './fixedTickBus'

/**
 * Reaching a host's fixed tick from anywhere below it.
 *
 * A scene's clock is owned by whatever already runs one — in the raid that is
 * the player controller's fixed step, in the AI labs their session loop. This
 * carries that tick DOWN to entities that must age with it but sit several
 * layers below the component that owns it, and whose population changes while
 * the game is running (a corpse's collapse ramps, say).
 *
 * The alternative was threading a callback prop through every layer in between —
 * `EnemyBodies` → `EnemyBody`, `ZonePlayer` → `Stalker` — none of which has any
 * business knowing about a clock. Context is what stops those layers from being
 * rewritten to carry something they do not use.
 *
 * Split from the components in `FixedTick.tsx` only because a module may export
 * either components or plain functions, not both, without breaking fast refresh.
 */
export const FixedTickContext = createContext<FixedTickBus | null>(null)

/** The scene's own bus, created once. Its owner emits; descendants subscribe. */
export function useOwnedFixedTickBus(): FixedTickBus {
  return useMemo(() => createFixedTickBus(), [])
}

/**
 * Ages with the host's simulation, once per simulated tick.
 *
 * The listener is republished through a ref after every render rather than being
 * resubscribed, so a connector may close over whatever it likes without churning
 * the subscription on a per-frame path.
 *
 * Returns whether a host clock was actually found. A caller that gets `false` is
 * mounted somewhere that never ticks, which is a wiring mistake and not a state
 * to paper over: the only fallback available would be the render delta, and that
 * is the exact defect this exists to remove.
 */
export function useFixedTick(listener: FixedTickListener): boolean {
  const bus = useContext(FixedTickContext)
  const current = useRef(listener)

  useEffect(() => {
    current.current = listener
  })

  useEffect(() => {
    if (!bus) return
    return bus.subscribe((deltaSeconds) => current.current(deltaSeconds))
  }, [bus])

  return bus !== null
}
