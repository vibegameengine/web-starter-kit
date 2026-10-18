import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { COMMENT_ALLOW_MARKER, LIMITS, baselineOf, isAllowedComment, isSource, judge, measureFile } from './cleanCode.mjs'

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

describe('a comment cannot buy length', () => {
  const body = Array.from({ length: 102 }, (_, i) => `  const x${i} = ${i}`)
  const wrap = (rows) => ['function big() {', ...rows, '}', ''].join('\n')

  it('does not shrink a function when its lines get trailing comments', () => {
    const plain = measure('big.ts', wrap(body))
    const commented = measure('big.ts', wrap(body.map((line, i) => (i < 40 ? `${line} // step ${i}` : line))))
    expect(commented.functions[0].lines).toBe(plain.functions[0].lines)
    expect(judge(commented, undefined).blockers.length).toBeGreaterThan(0)
  })

  it('still does not count a comment that owns its whole line', () => {
    const spaced = measure('big.ts', wrap(body.flatMap((line, i) => (i < 40 ? [`  // step ${i}`, line] : [line]))))
    expect(spaced.functions[0].lines).toBe(measure('big.ts', wrap(body)).functions[0].lines)
  })
})

describe('what is a comment', () => {
  it('does not count shader lines in a template literal', () => {
    const source = 'const shader = `\n// not a comment, it is GLSL\nvoid main() {}\n`\n'
    expect(measure('a.ts', source).comments).toBe(0)
  })

  it('counts a block comment once, where it starts', () => {
    const file = measure('a.ts', 'const a = 1\n/**\n * one\n * two\n */\nconst b = 2\n')
    expect(file.comments).toBe(1)
    expect(file.commentsAt).toEqual([2])
  })

  it('counts a trailing comment and a JSX comment', () => {
    expect(measure('a.tsx', 'const a = 1 // why\nconst b = <div>{/* note */}</div>\n').comments).toBe(2)
  })

  it('does not count comment-like text in strings, templates, regular expressions or JSX text', () => {
    const source = [
      'const a = "/* not */"',
      'const b = `${a} // not`',
      'const c = /\\/\\/ not/g',
      'const d = <a href="//x">http://site</a>',
      '',
    ].join('\n')
    expect(measure('a.tsx', source).comments).toBe(0)
  })

  it('still sees a comment after a template with a substitution, which a raw scanner loses', () => {
    const source = 'const a = 1\nconst b = `x ${a} y`\n// after\nexport const c = b\n'
    expect(measure('a.ts', source).commentsAt).toEqual([3])
  })

  it('does not count a shebang', () => {
    expect(measure('a.mjs', '#!/usr/bin/env node\nexport const a = 1\n').comments).toBe(0)
  })
})

describe('comments are forbidden', () => {
  it('blocks a new file that holds one', () => {
    const verdict = judge(measure('a.ts', '// explains\nexport const a = 1\n'), undefined)
    expect(verdict.blockers.join(' ')).toContain('Comments are forbidden')
  })

  it('lets a comment marked important stay', () => {
    const file = measure('a.ts', `// ${COMMENT_ALLOW_MARKER} measured: 1706 actors, 0 failures\nexport const a = 1\n`)
    expect(file.comments).toBe(0)
  })

  it('lets a recorded file keep its old comments, and warns about them', () => {
    const file = measure('a.ts', '// old\n// older\nexport const a = 1\n')
    const verdict = judge(file, baselineOf(file))
    expect(verdict.blockers).toEqual([])
    expect(verdict.warnings.join(' ')).toContain('old comments remain')
  })

  it('blocks a recorded file gaining one more', () => {
    const before = measure('a.ts', '// old\nexport const a = 1\n')
    const after = measure('a.ts', '// old\n// new\nexport const a = 1\n')
    expect(judge(after, baselineOf(before)).blockers.length).toBe(1)
  })
})

describe('toolchain directives are not comments', () => {
  const allowed = [
    '/// <reference types="vite/client" />',
    '// eslint-disable-next-line react-hooks/exhaustive-deps -- the ref is stable',
    '/* eslint-disable no-console */',
    '// eslint-enable',
    '/* eslint no-undef: off */',
    '/* global THREE, window: readonly */',
    '// @ts-expect-error three types lag behind the runtime',
    '// @ts-nocheck',
    '/*#__PURE__*/',
    '/* @vite-ignore */',
    '/* webpackChunkName: "lab" */',
    '// prettier-ignore',
    '/* c8 ignore next */',
    '/** @vitest-environment jsdom */',
    '/** @jsxImportSource @emotion/react */',
    '//# sourceMappingURL=index.js.map',
  ]

  const prose = ['// eslint is strict here', '// global state lives in the store', '// see @ts-expect-error below', '/** Angular damping. */', '/// a triple-slash note']

  it.each(allowed)('passes %s', (token) => {
    expect(isAllowedComment(token)).toBe(true)
  })

  it.each(prose)('forbids %s', (token) => {
    expect(isAllowedComment(token)).toBe(false)
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

describe('the guard and the baseline judge the same files', () => {
  it('takes a config file at the repository root', () => {
    expect(isSource('vite.config.ts')).toBe(true)
  })

  it('leaves dependencies, build output and the skills alone', () => {
    expect(isSource('node_modules/three/build/three.js')).toBe(false)
    expect(isSource('dist/assets/index.js')).toBe(false)
    expect(isSource('agents/skills/clean-code/example.ts')).toBe(false)
  })

  it('answers the same for a Windows path as for a POSIX one', () => {
    expect(isSource('vite\\plugins\\a.ts')).toBe(true)
    expect(isSource('a\\node_modules\\b.ts')).toBe(false)
  })
})

describe('the limits are the ones the skill documents', () => {
  const skill = readFileSync(resolve(import.meta.dirname, '../../agents/skills/clean-code/SKILL.md'), 'utf8')
  const row = (label) => skill.split(/\r?\n/).find((line) => line.startsWith(`| ${label} `)) ?? ''
  const numbers = (label) => (row(label).match(/\*\*([\d.]+)/g) ?? []).map((hit) => Number(hit.slice(2)))

  it('states the file limit the code enforces', () => {
    expect(numbers('File')).toEqual([LIMITS.fileLines])
  })

  it('states both function limits the code enforces', () => {
    expect(numbers('Function')).toEqual([LIMITS.functionLines, LIMITS.functionLinesHard])
  })

  it('states the parameter and nesting limits', () => {
    expect(numbers('Parameters')).toEqual([LIMITS.parameters])
    expect(numbers('Nesting')).toEqual([LIMITS.nesting])
  })

  it('names the marker the code accepts', () => {
    expect(skill).toContain(`\`${COMMENT_ALLOW_MARKER}\``)
  })
})
