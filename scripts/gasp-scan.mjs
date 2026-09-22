/* @important Says which nodes and settings a binary Unreal asset actually
   contains, which is the only way to compare against GASP: its animation graph
   ships as .uasset and none of it is readable source. The name table is, and it
   names every node type, settings struct and variable the graph uses.

     node scripts/gasp-scan.mjs <content dir> <word> [word...]

   Answers "does GASP use this node at all", not "with what numbers" — the
   values are serialised by name index and are not recoverable this way. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
const words = process.argv.slice(3)
const found = new Map()

function scan(path) {
  const text = readFileSync(path, 'latin1')
  for (const word of words) {
    if (!text.includes(word)) continue
    if (!found.has(word)) found.set(word, [])
    found.get(word).push(path.slice(root.length).replaceAll('\\', '/'))
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(uasset|umap)$/i.test(entry)) scan(path)
  }
}

if (!root || words.length === 0) throw new Error('usage: gasp-scan.mjs <content dir> <word> [word...]')
walk(root)
for (const word of words) {
  const hits = found.get(word) ?? []
  console.log(`${word}: ${hits.length} assets${hits.length ? ' — ' + hits.slice(0, 5).join(' ') : ''}`)
}
