import { describe, expect, it } from 'vitest'

import { structurallyEqual } from './structurallyEqual'

describe('structurallyEqual', () => {
  it('calls two freshly built readouts with the same numbers equal', () => {
    expect(structurallyEqual({ health: 100, radiation: 0 }, { health: 100, radiation: 0 })).toBe(true)
  })

  it('sees a changed reading', () => {
    expect(structurallyEqual({ health: 100 }, { health: 99 })).toBe(false)
  })

  it('looks inside a nested value object', () => {
    const carry = (speed: number) => ({ carryLoad: { speedMultiplier: speed, tier: 'light' }, hasArtifact: false })
    expect(structurallyEqual(carry(1), carry(1))).toBe(true)
    expect(structurallyEqual(carry(1), carry(0.8))).toBe(false)
  })

  it('compares arrays by content and length', () => {
    expect(structurallyEqual([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(structurallyEqual([1, 2, 3], [1, 2])).toBe(false)
    expect(structurallyEqual([{ a: 1 }], [{ a: 1 }])).toBe(true)
  })

  it('does not confuse a missing key with an undefined one', () => {
    expect(structurallyEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
  })

  it('treats null and an object as different', () => {
    expect(structurallyEqual(null, {})).toBe(false)
    expect(structurallyEqual(null, null)).toBe(true)
  })

  it('refuses to guess about values it cannot read, and says so by identity', () => {
    const fn = () => 0
    expect(structurallyEqual(fn, fn)).toBe(true)
    expect(structurallyEqual(() => 0, () => 0)).toBe(false)
    expect(structurallyEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(false)
  })

  it('gives up rather than recursing without bound', () => {
    const deep = () => ({ a: { b: { c: { d: { e: 1 } } } } })
    expect(structurallyEqual(deep(), deep())).toBe(false)
  })
})
