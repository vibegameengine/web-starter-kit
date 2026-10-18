#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const here = resolve(import.meta.dirname, '../..')
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

function giveUp(why) {
  process.stdout.write(JSON.stringify({ systemMessage: `clean-code: not measured (${why}).` }))
  process.exit(0)
}

async function readStdin() {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) data += chunk
  return data
}

let payload
try {
  payload = JSON.parse(((await readStdin()) || '').replace(/^﻿/, ''))
} catch (error) {
  giveUp(`the tool payload on stdin was not JSON: ${error.message}`)
}

const path = payload?.tool_response?.filePath || payload?.tool_input?.file_path || ''
if (!path) giveUp('the tool payload carried no file path')

let clean
let ts
try {
  ts = createRequire(resolve(here, 'package.json'))('typescript')
  clean = await import(pathToFileURL(resolve(here, 'scripts/lib/cleanCode.mjs')).href)
} catch (error) {
  giveUp(`typescript or scripts/lib/cleanCode.mjs did not load from ${here}: ${error.message}`)
}

if (!clean.isSource(path)) process.exit(0)

let text
try {
  text = readFileSync(path, 'utf8')
} catch (error) {
  giveUp(`cannot read ${path}: ${error.code ?? error.message}`)
}

let baseline = {}
try {
  baseline = JSON.parse(readFileSync(resolve(root, '.claude/clean-code-baseline.json'), 'utf8')).files ?? {}
} catch (error) {
  if (error.code !== 'ENOENT') {
    giveUp(`.claude/clean-code-baseline.json is unreadable (${error.message}); every recorded file would block`)
  }
}

const fold = (value) => value.replace(/\\/g, '/').toLowerCase()
const prefix = `${fold(root)}/`
const wanted = fold(path)
const relative = wanted.startsWith(prefix) ? path.replace(/\\/g, '/').slice(prefix.length) : path.replace(/\\/g, '/')
const entry = Object.entries(baseline).find(([file]) => fold(file) === fold(relative))?.[1]

const { blockers, warnings } = clean.judge(clean.measureFile(ts, path, text), entry)
if (blockers.length === 0 && warnings.length === 0) process.exit(0)

const head = `clean-code, ${relative}:`
const body = [...blockers.map((line) => `  HARD:  ${line}`), ...warnings.slice(0, 8).map((line) => `  soft:  ${line}`)].join('\n')
const out = { systemMessage: `${head}\n${body}` }

if (blockers.length > 0) {
  out.decision = 'block'
  out.reason =
    `${head}\n${body}\n\n` +
    'Rules and their reasons: agents/skills/clean-code. Fix it now rather than ' +
    'later — an edit inside a god function adds god function. Comments are ' +
    `forbidden; toolchain directives pass, and a comment that must stay carries ${clean.COMMENT_ALLOW_MARKER}.`
} else {
  out.hookSpecificOutput = { additionalContext: `${head}\n${body}`, hookEventName: 'PostToolUse' }
}

process.stdout.write(JSON.stringify(out))
