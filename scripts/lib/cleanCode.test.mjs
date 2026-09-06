/**
 * The measurement itself: what counts as a function, what counts as a line of it,
 * what counts as a comment, and when the ratchet blocks.
 *
 * Every case below was chosen because getting it wrong is silent. A brace count
 * misses an arrow function entirely; a line-prefix test calls GLSL in a template
 * literal prose; subtracting comments and markup separately once drove a 37-line
 * function to a length of -25. None of those throw. They just report a number
 * that is wrong in the direction of "looks fine".
 */
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { LIMITS, baselineOf, judge, measureFile } from './cleanCode.mjs'

const measure = (name, source) => measureFile(ts, name, source)

const lines = (count, body = '  const x = 1') => Array.from({ length: count }, () => body).join('\n')

describe('what counts as a function', () => {
  it('sees an arrow function assigned to a const, which a brace count does not', () => {
    const file = measure('a.ts', `const run = () => {\n${lines(5)}\n}\n`)
    expect(file.functions.map((fn) => fn.name)).toEqual(['run'])
  })

  it('sees a class method and a callback separately', () => {
    const file = measure('a.ts', `class A {\n  go() {\n    [1].forEach((n) => {\n      use(n)\n    })\n  }\n}\n`)
    expect(file.functions.map((fn) => fn.name).sort()).toEqual(['(anonymous)', 'go'])
  })
})

describe('length measures code', () => {
  it('does not count comment lines', () => {
    const withProse = measure('a.ts', `function f() {\n${'  // prose\n'.repeat(30)}  return 1\n}\n`)
    expect(withProse.functions[0].lines).toBe(3)
  })

  it('does not count blank lines', () => {
    const spaced = measure('a.ts', `function f() {\n${'\n'.repeat(30)}  return 1\n}\n`)
    expect(spaced.functions[0].lines).toBe(3)
  })

  it('does not count JSX markup', () => {
    const markup = `<div>\n${'  <span>x</span>\n'.repeat(40)}</div>`
    const component = measure('a.tsx', `function C() {\n  return (\n    ${markup}\n  )\n}\n`)
    expect(component.functions[0].lines).toBeLessThan(10)
  })

  it('never reports a negative length, having once reported -25', () => {
    const source = `function C() {\n  return (\n    <div>\n      {/* a */}\n      {/* b */}\n    </div>\n  )\n}\n`
    expect(measure('a.tsx', source).functions[0].lines).toBeGreaterThanOrEqual(0)
  })
})

describe('what is a comment', () => {
  it('does not count shader lines in a template literal', () => {
    const source = 'const shader = `\n// not a comment, it is GLSL\nvoid main() {}\n`\n'
    expect(measure('a.ts', source).commentLines).toBe(0)
  })

  it('counts a real block comment once per line', () => {
    expect(measure('a.ts', '/**\n * one\n * two\n */\nconst a = 1\n').commentLines).toBe(4)
  })
})

describe('nesting counts control flow, once', () => {
  it('reads a flat else-if chain as one level', () => {
    const chain = `function f(v) {\n  if (v === 1) { a() }\n  else if (v === 2) { a() }\n  else if (v === 3) { a() }\n  else if (v === 4) { a() }\n  else { a() }\n}\n`
    expect(measure('a.ts', chain).functions[0].nesting).toBe(1)
  })

  it('does not count a catch clause on top of its own try', () => {
    expect(measure('a.ts', 'function f() {\n  try { a() } catch { b() }\n}\n').functions[0].nesting).toBe(1)
  })
})

describe('the ratchet', () => {
  const oversized = measure('big.ts', `function big() {\n${lines(120)}\n}\n`)

  it('blocks a new file that starts over the limit', () => {
    expect(judge(oversized, undefined).blockers.join(' ')).toContain('big()')
  })

  it('lets a recorded file stay as bad as it was', () => {
    expect(judge(oversized, baselineOf(oversized)).blockers).toEqual([])
  })

  it('blocks the same file getting worse', () => {
    const worse = measure('big.ts', `function big() {\n${lines(200)}\n}\n`)
    expect(judge(worse, baselineOf(oversized)).blockers.length).toBeGreaterThan(0)
  })

  // One 203-line function must not license two of 200 each.
  it('blocks a second oversized function appearing under the same worst case', () => {
    const split = measure('big.ts', `function a() {\n${lines(100)}\n}\nfunction b() {\n${lines(100)}\n}\n`)
    expect(judge(split, baselineOf(oversized)).blockers.join(' ')).toContain('functions are over')
  })

  it('says nothing about a file that is inside every limit', () => {
    const small = measure('small.ts', 'export function f() {\n  return 1\n}\n')
    const { blockers, warnings } = judge(small, undefined)
    expect([...blockers, ...warnings]).toEqual([])
  })
})

describe('the recorded comment share is read, not just written', () => {
  const prose = measure('prose.ts', `${'// a line of prose\n'.repeat(60)}const a = 1\n`)

  it('warns about a prose-heavy file nobody has recorded', () => {
    expect(judge(prose, undefined).warnings.join(' ')).toContain('% of this file is comment')
  })

  it('stops warning once that share is the recorded one', () => {
    expect(judge(prose, baselineOf(prose)).warnings.join(' ')).not.toContain('% of this file is comment')
  })

  it('warns again when the share climbs past what was recorded', () => {
    const worse = measure('prose.ts', `${'// a line of prose\n'.repeat(200)}const a = 1\n`)
    const wasHalfCode = baselineOf(measure('prose.ts', `${'// a line of prose\n'.repeat(60)}${lines(40)}\n`))
    expect(judge(worse, wasHalfCode).warnings.join(' ')).toContain('% of this file is comment')
  })
})

describe('the limits are the ones the skill documents', () => {
  it('keeps file and function thresholds where agents/skills/clean-code says', () => {
    expect(LIMITS.fileLines).toBe(500)
    expect(LIMITS.functionLinesHard).toBe(80)
    expect(LIMITS.functionLines).toBe(40)
  })
})
