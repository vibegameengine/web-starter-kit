#!/usr/bin/env node
// Measures a file that was just written against agents/skills/clean-code, and
// blocks only what got WORSE than `.claude/clean-code-baseline.json` records.
//
// It exists because "keep it small" as advice does not survive a long session.
// Measured here the day it was written: 196 source files, 10 877 lines of code
// against 4 040 lines of comment, and one 980-line file that was 59% prose.
//
// PostToolUse hook: reads the tool payload on stdin, answers with JSON.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function readStdin() {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) data += chunk
  return data
}

let payload = {}
try {
  // A leading BOM makes JSON.parse throw, and a guard that says nothing reads
  // as a pass — the one failure this file must not have.
  payload = JSON.parse(((await readStdin()) || '{}').replace(/^﻿/, ''))
} catch {
  payload = {}
}

const path = payload?.tool_response?.filePath || payload?.tool_input?.file_path || ''
if (!/\.(ts|tsx|mts|cts|js|jsx|mjs)$/i.test(path)) process.exit(0)
if (/[\\/](node_modules|dist|coverage|vendor)[\\/]/i.test(path)) process.exit(0)
if (/[\\/]agents[\\/]skills[\\/]/i.test(path)) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

let text
try {
  text = readFileSync(path, 'utf8')
} catch {
  process.exit(0)
}

let ts
let clean
try {
  ts = createRequire(resolve(root, 'package.json'))('typescript')
  clean = await import(pathToFileURL(resolve(root, 'scripts/lib/cleanCode.mjs')).href)
} catch {
  // Without the compiler or the shared module there is no measurement, and a
  // guess about function extents is exactly what this guard refuses to make.
  process.exit(0)
}

let baseline = {}
try {
  baseline = JSON.parse(readFileSync(resolve(root, '.claude/clean-code-baseline.json'), 'utf8')).files ?? {}
} catch {
  baseline = {}
}

const relative = path.replace(/\\/g, '/').replace(`${root.replace(/\\/g, '/')}/`, '')
const measurement = clean.measureFile(ts, path, text)
const { blockers, warnings } = clean.judge(measurement, baseline[relative])

if (blockers.length === 0 && warnings.length === 0) process.exit(0)

const head = `clean-code, ${relative}:`
const body = [...blockers.map((line) => `  HARD:  ${line}`), ...warnings.slice(0, 8).map((line) => `  soft:  ${line}`)].join('\n')
const out = { systemMessage: `${head}\n${body}` }

if (blockers.length > 0) {
  out.decision = 'block'
  out.reason =
    `${head}\n${body}\n\n` +
    'Thresholds and their reasons: agents/skills/clean-code. Split it now rather ' +
    'than later — an edit inside a god function adds god function. Any comment ' +
    'that records a MEASUREMENT or cites a source stays, whatever else goes.'
} else {
  out.hookSpecificOutput = { additionalContext: `${head}\n${body}`, hookEventName: 'PostToolUse' }
}

process.stdout.write(JSON.stringify(out))
