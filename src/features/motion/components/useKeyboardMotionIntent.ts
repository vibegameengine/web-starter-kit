import { useEffect, useMemo, useRef } from 'react'

import type { MotionIntent } from '../systems/motionIntent'

export type MotionIntentSource = {
  readonly read: (yaw: number) => MotionIntent
}

export type MotionKeyBindings = {
  readonly backward: readonly string[]
  readonly crouch: readonly string[]
  readonly forward: readonly string[]
  readonly jump: readonly string[]
  readonly left: readonly string[]
  readonly right: readonly string[]
  readonly sprint: readonly string[]
}

export const DEFAULT_MOTION_KEYS: MotionKeyBindings = {
  backward: ['KeyS', 'ArrowDown'],
  crouch: ['ControlLeft', 'KeyC'],
  forward: ['KeyW', 'ArrowUp'],
  jump: ['Space'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
}

function anyHeld(held: ReadonlySet<string>, codes: readonly string[]): boolean {
  return codes.some((code) => held.has(code))
}

function axis(held: ReadonlySet<string>, positive: readonly string[], negative: readonly string[]): number {
  return (anyHeld(held, positive) ? 1 : 0) - (anyHeld(held, negative) ? 1 : 0)
}

export function useKeyboardMotionIntent(bindings: MotionKeyBindings = DEFAULT_MOTION_KEYS): MotionIntentSource {
  const held = useRef(new Set<string>())

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => held.current.add(event.code)
    const onKeyUp = (event: KeyboardEvent) => held.current.delete(event.code)
    const onBlur = () => held.current.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return useMemo(() => ({
    read: (yaw: number) => ({
      crouch: anyHeld(held.current, bindings.crouch),
      forward: axis(held.current, bindings.forward, bindings.backward),
      jump: anyHeld(held.current, bindings.jump),
      right: axis(held.current, bindings.right, bindings.left),
      sprint: anyHeld(held.current, bindings.sprint),
      yaw,
    }),
  }), [bindings])
}
