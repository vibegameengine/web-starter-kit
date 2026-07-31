import { describe, expect, it } from 'vitest'

import { createFixedTickBus } from './fixedTickBus'

describe('fixed tick bus', () => {
  it('runs every listener once per emit, with the simulation step', () => {
    const bus = createFixedTickBus()
    const seen: number[] = []
    bus.subscribe((delta) => seen.push(delta))
    bus.subscribe((delta) => seen.push(delta * 2))

    bus.emit(1 / 30)

    expect(seen).toEqual([1 / 30, 2 / 30])
  })

  it('stops calling a listener once it unsubscribes', () => {
    const bus = createFixedTickBus()
    let calls = 0
    const detach = bus.subscribe(() => { calls += 1 })

    bus.emit(0.1)
    detach()
    bus.emit(0.1)

    expect(calls).toBe(1)
    expect(bus.size()).toBe(0)
  })

  it('survives a listener detaching from inside the emit it is running in', () => {
    // A corpse can be unmounted by the very tick that killed the body it hung
    // on. Splicing the array mid-loop would skip whichever listener slid into
    // the freed slot, which is the kind of miss nothing downstream can detect.
    const bus = createFixedTickBus()
    const order: string[] = []
    const detachFirst = bus.subscribe(() => {
      order.push('first')
      detachFirst()
    })
    bus.subscribe(() => order.push('second'))

    bus.emit(0.1)
    expect(order).toEqual(['first', 'second'])

    bus.emit(0.1)
    expect(order).toEqual(['first', 'second', 'second'])
    expect(bus.size()).toBe(1)
  })

  it('runs a listener attached during an emit in that same pass', () => {
    // Pinned so the behaviour is a decision rather than an accident of the loop
    // reading `length` live. Nothing may DEPEND on it — a subscriber that needs
    // to run before or after another one belongs in the host's tick body, where
    // the order is written down — but it must at least be the same every time.
    const bus = createFixedTickBus()
    const order: string[] = []
    bus.subscribe(() => {
      order.push('host')
      if (order.length === 1) bus.subscribe(() => order.push('late'))
    })

    bus.emit(0.1)
    bus.emit(0.1)

    expect(order).toEqual(['host', 'late', 'host', 'late'])
  })
})
