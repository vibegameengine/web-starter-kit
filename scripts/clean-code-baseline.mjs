// Records today's clean-code numbers so the guard reports regressions only.
//
//   npm run clean-code:baseline
//
// Run it after a real cleanup, never to make a complaint go away: every entry
// here is a file the repository has agreed to leave worse than its own limits,
// and the list is meant to shrink.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { LIMITS, baselineOf, isOverLimits, measureFile, trackedSources } from './lib/cleanCode.mjs'

/** Both prerequisites fail with a stack that says nothing about the cause. */
function required(what, load) {
  try {
    return load()
  } catch (error) {
    console.error(`clean-code baseline: ${what}\n  ${error.message.split('\n')[0]}`)
    process.exit(1)
  }
}

const ts = required(
  'needs the typescript package, which is a devDependency of this project. Run `npm install` first.',
  () => createRequire(`${process.cwd()}/package.json`)('typescript'),
)

const files = required(
  'lists its files with `git ls-files`, so it has to run inside a git repository.',
  () => trackedSources(execSync),
)

const entries = {}
let overFile = 0
let overFunction = 0
let overComment = 0

for (const file of files) {
  const measurement = measureFile(ts, file, readFileSync(file, 'utf8'))
  if (!isOverLimits(measurement)) continue
  entries[file] = baselineOf(measurement)
  if (measurement.fileLines > LIMITS.fileLines) overFile += 1
  if (measurement.worstFunction > LIMITS.functionLinesHard) overFunction += 1
  if (measurement.commentRun > LIMITS.commentBlock || measurement.commentShare > LIMITS.commentShare) overComment += 1
}

writeFileSync(
  '.claude/clean-code-baseline.json',
  `${JSON.stringify({ files: entries, recorded: new Date().toISOString().slice(0, 10) }, null, 2)}\n`,
)

console.log(`${files.length} files measured; ${Object.keys(entries).length} recorded as over at least one limit`)
console.log(`  ${overFile} over ${LIMITS.fileLines} lines, ${overFunction} with a function over ${LIMITS.functionLinesHard}, ${overComment} over a comment limit`)
for (const [file, entry] of Object.entries(entries)) {
  if (entry.fileLines <= LIMITS.fileLines && entry.worstFunction <= LIMITS.functionLinesHard) continue
  console.log(`  ${String(entry.fileLines).padStart(4)} lines, worst ${String(entry.worstFunction).padStart(3)}, over-limit ${entry.functionsOverLimit}  ${file}`)
}
