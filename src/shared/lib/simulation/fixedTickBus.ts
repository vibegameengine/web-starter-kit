/**
 * One fixed tick, many listeners.
 *
 * `advanceFixedStep` gives a host ONE authoritative clock. That is enough while
 * every gameplay writer is a named field the host can call in order — which is
 * how the raid drives its session, its anomalies and its survival systems. It
 * stops being enough as soon as the things that must age on that clock are
 * MOUNTED RATHER THAN LISTED: a corpse's collapse ramps belong to whichever
 * bodies happen to be dead right now, several layers below the component that
 * owns the clock, and the population changes while the tick is running.
 *
 * So this is the second shape a fixed tick is consumed in, and deliberately the
 * only other one: the host still owns the clock and still decides WHEN a tick
 * happens; a subscriber only says it wants to age with it. Order between
 * subscribers is explicitly NOT a thing this offers — anything whose correctness
 * depends on running before or after another system must be a call in the host's
 * tick body, where the order is written down.
 *
 * Framework-free on purpose: no React, no three. The React connector is a
 * separate file, and this is what the tests exercise.
 */

export type FixedTickListener = (deltaSeconds: number) => void

export type FixedTickBus = {
  /**
   * How far into the NEXT step the current frame falls, 0..1.
   *
   * The clock already computes this — it is the accumulator left over once whole
   * steps have been taken — and until now it threw it away. Without it a renderer
   * that wants to draw between two ticks has to guess the value from its own
   * frame delta, and that guess is wrong in the most damaging possible way: the
   * frame delta is LARGER than a step whenever the display is slower than the
   * simulation, so the guess saturates at 1 and the interpolation silently
   * becomes no interpolation at all. Measured on this project: 125 Hz against
   * 120 fps gives 1.04 every single frame.
   *
   * Read at render time, written by the clock. Not a parameter of `emit`,
   * because it is a property of the FRAME rather than of the step.
   */
  readonly alpha: () => number
  /** Runs every listener once, with the simulation's own step. */
  readonly emit: (deltaSeconds: number) => void
  /** Called by the clock once per frame, after it has taken its steps. */
  readonly setAlpha: (value: number) => void
  /** Attaches a listener; call the returned function to detach it. */
  readonly subscribe: (listener: FixedTickListener) => () => void
  /** How many listeners are attached. For tests and DEV readouts only. */
  readonly size: () => number
}

/** A detached listener's slot, kept until the emit in progress has finished. */
const REMOVED: FixedTickListener = () => {}

export function createFixedTickBus(): FixedTickBus {
  const listeners: FixedTickListener[] = []
  let emitting = false
  let removed = false
  let alpha = 0

  const compact = () => {
    removed = false
    for (let index = listeners.length - 1; index >= 0; index -= 1) {
      if (listeners[index] === REMOVED) listeners.splice(index, 1)
    }
  }

  return {
    alpha: () => alpha,
    setAlpha: (value: number) => {
      alpha = value
    },
    emit: (deltaSeconds: number) => {
      // Iterated by index over the live array rather than over a copy: this runs
      // thirty times a second for the whole session, and a per-tick allocation
      // is exactly what the project's frame-loop rule forbids. A listener that
      // detaches mid-emit leaves a no-op behind instead of shifting the array
      // out from under the loop, and the gap is closed once the loop is done.
      emitting = true
      for (let index = 0; index < listeners.length; index += 1) listeners[index](deltaSeconds)
      emitting = false
      if (removed) compact()
    },
    size: () => {
      let count = 0
      for (const listener of listeners) if (listener !== REMOVED) count += 1
      return count
    },
    subscribe: (listener: FixedTickListener) => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index < 0) return
        if (emitting) {
          listeners[index] = REMOVED
          removed = true
          return
        }
        listeners.splice(index, 1)
      }
    },
  }
}
