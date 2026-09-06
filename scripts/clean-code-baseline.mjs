// Records today's clean-code numbers so the guard can block regressions only.
//
//   npm run clean-code:baseline
//
// Run it after a real cleanup, never to make a complaint go away: every entry
// here is a file the repository has agreed to leave worse than its own limits,
// and the list is meant to shrink.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { LIMITS, baselineOf, measureFile } from './lib/cleanCode.mjs'

const ts = createRequire(`${process.cwd()}/package.json`)('typescript')

const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "vite/**/*.ts" "scripts/*.mjs" "scripts/**/*.mjs" "scripts/**/*.ts" ".claude/hooks/*.mjs"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const entries = {}
let overFile = 0
let overFunction = 0

for (const file of files) {
  const measurement = measureFile(ts, file, readFileSync(file, 'utf8'))
  const overLimit = measurement.fileLines > LIMITS.fileLines || measurement.worstFunction > LIMITS.functionLinesHard
  if (!overLimit) continue
  entries[file] = baselineOf(measurement)
  if (measurement.fileLines > LIMITS.fileLines) overFile += 1
  if (measurement.worstFunction > LIMITS.functionLinesHard) overFunction += 1
}

writeFileSync(
  '.claude/clean-code-baseline.json',
  `${JSON.stringify({ files: entries, recorded: new Date().toISOString().slice(0, 10) }, null, 2)}\n`,
)

console.log(`${files.length} files measured; ${Object.keys(entries).length} recorded as over the limits`)
console.log(`  ${overFile} over ${LIMITS.fileLines} lines, ${overFunction} with a function over ${LIMITS.functionLinesHard}`)
for (const [file, entry] of Object.entries(entries)) {
  console.log(`  ${String(entry.fileLines).padStart(4)} lines, worst function ${String(entry.worstFunction).padStart(3)}  ${file}`)
}
