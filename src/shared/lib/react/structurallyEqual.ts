/**
 * How deep a HUD readout is allowed to be before two of them are simply called
 * different. These are flat data transfer objects with at most a nested value
 * object (a carry load, a reload timer); anything deeper is not a readout.
 */
const MAX_DEPTH = 4

/**
 * Are these two values the same DATA, ignoring object identity?
 *
 * Simulation systems publish their HUD readout as a freshly built object on
 * every tick, so identity says nothing: `{ health: 100 } !== { health: 100 }`
 * thirty times a second. Comparing the data instead is what lets a screen
 * commit React state only when something actually changed.
 *
 * Deliberately for PLAIN DATA only — primitives, arrays and object literals.
 * A function, a class instance or a Three object compares false unless it is
 * literally the same reference, which is the honest answer for those.
 */
export function structurallyEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true
  if (depth >= MAX_DEPTH) return false
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => structurallyEqual(item, b[index], depth + 1))
  }
  // Anything that is not a plain object (a Map, a Vector3, a class instance)
  // has state this cannot see, so identity is the only safe answer.
  if (Object.getPrototypeOf(a) !== Object.prototype) return false

  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.hasOwn(right, key) && structurallyEqual(left[key], right[key], depth + 1))
}
