import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import { baselineOf, measureFile } from '../../scripts/lib/cleanCode.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const GUARD = join(ROOT, '.claude/hooks/clean-code-guard.mjs')
const made = []

afterAll(() => {
  for (const dir of made) rmSync(dir, { force: true, recursive: true })
})

const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), 'clean-code-'))
  made.push(dir)
  return dir
}

const write = (dir, relative, body) => {
  const full = join(dir, relative)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
  return full
}

const send = (input, root = ROOT, guard = GUARD) => {
  const result = spawnSync(process.execPath, [guard], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input,
  })
  expect(result.stderr ?? '').toBe('')
  expect(result.status).toBe(0)
  const out = (result.stdout ?? '').trim()
  return out ? JSON.parse(out) : {}
}

const run = (filePath, root = ROOT, guard = GUARD) =>
  send(JSON.stringify({ tool_input: { file_path: filePath } }), root, guard)

const oversized = `export function big() {\n${'  const x = 1\n'.repeat(120)}}\n`

describe('what the guard looks at', () => {
  it('ignores a file it has no rules for', () => {
    expect(run(join(ROOT, 'README.md'))).toEqual({})
  })

  it('ignores its own skill directory, where the examples are deliberately bad', () => {
    expect(run(join(ROOT, 'agents/skills/clean-code/example.ts'))).toEqual({})
  })
})

describe('the scope the guard judges', () => {
  it('measures a config file at the repository root, which the baseline can record', () => {
    const verdict = run(join(ROOT, 'vite.config.ts'))
    expect(verdict.decision).toBeUndefined()
  })

  it('judges every file it measures against an entry the baseline could hold', () => {
    const recorded = JSON.parse(readFileSync(join(ROOT, '.claude/clean-code-baseline.json'), 'utf8')).files
    expect(Object.keys(recorded)).toContain('vite.config.ts')
  })
})

describe('the verdict', () => {
  it('blocks a new oversized function', () => {
    const verdict = run(write(sandbox(), 'src/big.ts', oversized))
    expect(verdict.decision).toBe('block')
    expect(verdict.reason).toContain('big()')
  })

  it('blocks a new comment', () => {
    const verdict = run(write(sandbox(), 'src/noted.ts', '// explains the constant\nexport const a = () => 1\n'))
    expect(verdict.decision).toBe('block')
    expect(verdict.reason).toContain('@important')
  })

  it('lets a comment marked important and a toolchain directive through', () => {
    const body = '// @important measured: 1706 actors\n// eslint-disable-next-line no-console\nexport const a = () => 1\n'
    expect(run(write(sandbox(), 'src/marked.ts', body))).toEqual({})
  })

  it('says nothing about a file that is inside the limits', () => {
    expect(run(write(sandbox(), 'src/small.ts', 'export const a = () => 1\n'))).toEqual({})
  })

  it('warns without blocking when a function is only past the target', () => {
    const body = `export function mid() {\n${'  const x = 1\n'.repeat(50)}}\n`
    const verdict = run(write(sandbox(), 'src/mid.ts', body))
    expect(verdict.decision).toBeUndefined()
    expect(verdict.hookSpecificOutput.additionalContext).toContain('mid()')
  })
})

describe('the baseline', () => {
  const recorded = (name = 'src/big.ts') => {
    const dir = sandbox()
    write(dir, name, oversized)
    const entry = baselineOf(measureFile(ts, name, oversized))
    write(dir, '.claude/clean-code-baseline.json', JSON.stringify({ files: { [name]: entry } }))
    return dir
  }

  const otherCase = (path) => path.replace(/^([A-Za-z]):/, (_, drive) => `${drive.toLowerCase()}:`)

  it('forgives a file it has recorded', () => {
    const dir = recorded()
    expect(run(join(dir, 'src/big.ts'), dir).decision).toBeUndefined()
  })

  it('is found under either drive letter, having once been found under only one', () => {
    const dir = recorded()
    const upper = run(join(dir, 'src/big.ts'), dir)
    const lower = run(otherCase(join(dir, 'src/big.ts')), dir)
    expect(lower.decision).toBeUndefined()
    expect(lower.decision).toBe(upper.decision)
  })

  it('is found when the recorded name has capitals in it', () => {
    const dir = recorded('src/BigThing.ts')
    expect(run(join(dir, 'src/BigThing.ts'), dir).decision).toBeUndefined()
  })

  it('still blocks the recorded file getting worse', () => {
    const dir = recorded()
    write(dir, 'src/big.ts', `export function big() {\n${'  const x = 1\n'.repeat(200)}}\n`)
    expect(run(join(dir, 'src/big.ts'), dir).decision).toBe('block')
  })

  it('blocks a recorded file gaining a comment', () => {
    const dir = recorded()
    write(dir, 'src/big.ts', `// a new note\n${oversized}`)
    expect(run(join(dir, 'src/big.ts'), dir).decision).toBe('block')
  })
})

describe('a gate that cannot measure says so', () => {
  it('does not stay silent when stdin is not JSON', () => {
    expect(send('{ not json').systemMessage).toContain('not measured')
  })

  it('does not stay silent when the payload carries no path', () => {
    expect(send('{}').systemMessage).toContain('not measured')
  })

  it('does not stay silent when the payload names the path differently', () => {
    expect(send(JSON.stringify({ tool_input: { path: 'src/a.ts' } })).systemMessage).toContain('not measured')
  })

  it('does not stay silent when the file is gone', () => {
    expect(run(join(ROOT, 'src/this-file-does-not-exist.ts')).systemMessage).toContain('not measured')
  })

  it('does not stay silent when the compiler will not resolve', () => {
    const dir = sandbox()
    mkdirSync(join(dir, '.claude/hooks'), { recursive: true })
    const orphan = join(dir, '.claude/hooks/clean-code-guard.mjs')
    copyFileSync(GUARD, orphan)
    const verdict = run(write(dir, 'src/a.ts', 'export const a = 1\n'), dir, orphan)
    expect(verdict.systemMessage).toContain('not measured')
    expect(verdict.systemMessage).toContain('typescript')
  })

  it('does not stay silent when the baseline is corrupt', () => {
    const dir = sandbox()
    write(dir, 'src/big.ts', oversized)
    write(dir, '.claude/clean-code-baseline.json', '{ not json')
    const verdict = run(join(dir, 'src/big.ts'), dir)
    expect(verdict.systemMessage).toContain('not measured')
    expect(verdict.systemMessage).toContain('baseline')
  })

  it('stays quiet about a baseline that was never written', () => {
    const dir = sandbox()
    expect(run(write(dir, 'src/small.ts', 'export const a = () => 1\n'), dir)).toEqual({})
  })
})
