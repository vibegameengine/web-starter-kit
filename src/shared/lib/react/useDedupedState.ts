import { useCallback, useRef, useState } from 'react'

import { structurallyEqual } from './structurallyEqual'

/**
 * React state that only commits when the VALUE changed, not when a new object
 * carrying the same value arrives.
 *
 * A fixed-tick system republishes its HUD readout every tick because that is
 * the only moment it knows anything; the object is new each time even when the
 * numbers are not. Fed straight into `useState`, that re-renders the whole
 * screen thirty times a second for a reading that changes once a minute —
 * which in a DEV build also fills the browser's user-timing buffer until the
 * tab runs out of memory.
 *
 * The returned setter is referentially STABLE, so it can be handed to a
 * memoised child without defeating the memo.
 */
export function useDedupedState<T>(initial: T | (() => T)): readonly [T, (next: T) => void] {
  // eslint-disable-next-line no-restricted-syntax -- this hook IS the guarded wrapper the rule sends callers to: the state exists so a republished object carrying unchanged values never reaches a render.
  const [value, setValue] = useState<T>(initial)
  // The setter is the only writer, so this mirror is always the committed value
  // without having to re-create the callback whenever it changes.
  const committed = useRef<T>(value)

  const commit = useCallback((next: T) => {
    if (structurallyEqual(committed.current, next)) return
    committed.current = next
    setValue(next)
  }, [])

  return [value, commit]
}
