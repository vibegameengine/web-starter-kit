#!/usr/bin/env node
// PostToolUse hook. Measures the file that was just written against
// agents/skills/clean-code and reports what got WORSE than
// `.claude/clean-code-baseline.json` records. The write has already happened by
// then: `decision: "block"` returns the reason to the model, it does not undo it.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// The compiler and the shared module are resolved from where this hook SITS, not
// from the project root: they ship in the same checkout, while the root only
// decides which baseline applies and what path to print. Resolving them from the
// root made the gate stop measuring, silently, whenever CLAUDE_PROJECT_DIR
// pointed at a subdirectory.
const here = resolve(import.meta.dirname, '../..')
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

// A silent exit 0 and a clean measurement look identical downstream, so every
// path that gives up says why. Otherwise the day the payload shape changes, the
// gate reports nothing forever and reads as a repository that got clean.
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
  // A leading BOM makes JSON.parse throw, and this is the one file where a
  // thrown parse must not turn into silence.
  payload = JSON.parse(((await readStdin()) || '').replace(/^\ufeff/, ''))
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
  // Without the compiler or the shared module there is no measurement, and a
  // guess about function extents is exactly what this guard refuses to make.
  giveUp(`typescript or scripts/lib/cleanCode.mjs did not load from ${here}: ${error.message}`)
}

// The same predicate the baseline uses. When the two disagreed, this measured
// files the baseline could never record, and they were blocked with no way to
// grant them.
if (!clean.isSource(path)) process.exit(0)

let text
try {
  text = readFileSync(path, 'utf8')
} catch (error) {
  giveUp(`cannot read ${path}: ${error.code ?? error.message}`)
}

// An unreadable baseline is not the same as an absent one: absent means a fresh
// repository with nothing forgiven, unreadable means every recorded file is
// about to be blocked for debt it was granted. The second one has to be loud.
let baseline = {}
try {
  baseline = JSON.parse(readFileSync(resolve(root, '.claude/clean-code-baseline.json'), 'utf8')).files ?? {}
} catch (error) {
  if (error.code !== 'ENOENT') {
    giveUp(`.claude/clean-code-baseline.json is unreadable (${error.message}); every recorded file would block`)
  }
}

// Windows hands the same file back under either drive-letter case, and a strict
// compare then misses the baseline entry — which fails CLOSED, blocking exactly
// the files the ratchet exists to let through. Measured: the same path passed as
// `C:\projects\…` and blocked as `c:\projects\…`. Folded for the LOOKUP only;
// the message prints the name as it really is.
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
    'Thresholds and their reasons: agents/skills/clean-code. Fix it now rather ' +
    'than later — an edit inside a god function adds god function. Any comment ' +
    'that records a MEASUREMENT or cites a source stays, whatever else goes.'
} else {
  out.hookSpecificOutput = { additionalContext: `${head}\n${body}`, hookEventName: 'PostToolUse' }
}

process.stdout.write(JSON.stringify(out))
