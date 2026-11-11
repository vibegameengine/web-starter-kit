import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VirtualStick } from './VirtualStick'

function renderStick() {
  const onChange = vi.fn()
  const onEnd = vi.fn()
  const { getByRole, unmount } = render(<VirtualStick label="Move" onChange={onChange} onEnd={onEnd} />)
  const stick = getByRole('application', { name: 'Move' })
  const captured = new Set<number>()
  stick.setPointerCapture = (id) => { captured.add(id) }
  stick.hasPointerCapture = (id) => captured.has(id)
  stick.releasePointerCapture = (id) => { captured.delete(id) }
  return { captured, onChange, onEnd, stick, unmount }
}

function drag(stick: HTMLElement, pointerId: number) {
  fireEvent.pointerDown(stick, { pointerId, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(stick, { pointerId, clientX: 130, clientY: 100 })
}

afterEach(() => { vi.restoreAllMocks() })

describe('VirtualStick', () => {
  it('converts screen movement to layout pixels in a scaled HUD', () => {
    const { stick, onChange } = renderStick()
    vi.spyOn(stick, 'offsetWidth', 'get').mockReturnValue(200)
    vi.spyOn(stick, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))

    drag(stick, 1)

    expect(onChange.mock.lastCall?.[0].x).toBe(1)
  })

  it('ignores a second finger and ends when the owning pointer is released outside', () => {
    const { stick, captured, onChange, onEnd } = renderStick()
    drag(stick, 1)
    drag(stick, 2)
    fireEvent.pointerUp(window, { pointerId: 2 })
    expect(onEnd).not.toHaveBeenCalled()
    expect(captured).toEqual(new Set([1]))

    fireEvent.pointerUp(window, { pointerId: 1 })

    expect(captured.size).toBe(0)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0 })
  })

  it('accepts a new drag after capture silently disappears', () => {
    const { stick, captured, onChange, onEnd } = renderStick()
    drag(stick, 1)
    captured.clear()

    drag(stick, 2)

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(captured).toEqual(new Set([2]))
    expect(onChange.mock.lastCall?.[0].x).toBe(0.5)
  })

  it('resets on tab hide without ending the gesture a second time on teardown', () => {
    const { stick, captured, onChange, onEnd, unmount } = renderStick()
    drag(stick, 1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    fireEvent(document, new Event('visibilitychange'))
    unmount()

    expect(captured.size).toBe(0)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0 })
  })
})
