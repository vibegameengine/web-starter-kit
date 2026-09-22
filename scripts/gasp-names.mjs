/* @important Lists the identifiers inside one binary Unreal asset, filtered by
   a pattern: the settings a GASP node exposes, the variables its graph reads.

     node scripts/gasp-names.mjs <asset.uasset> [pattern]

   Same limit as gasp-scan.mjs — names, never the values against them. */
import { readFileSync } from 'node:fs'

const path = process.argv[2]
const filter = new RegExp(process.argv[3] ?? '.', 'i')
const names = new Set()
let run = ''

if (!path) throw new Error('usage: gasp-names.mjs <asset.uasset> [pattern]')
for (const char of readFileSync(path, 'latin1')) {
  const code = char.charCodeAt(0)
  if (code >= 33 && code <= 126) {
    run += char
    continue
  }
  if (run.length >= 5 && /^[A-Za-z][A-Za-z0-9_]*$/.test(run) && filter.test(run)) names.add(run)
  run = ''
}
console.log([...names].sort().join('\n'))
