/**
 * Split a fused GLB into its actually-separate parts, by connected components.
 *
 * The Tripo assets arrive as ONE mesh with ONE node and no names, so nothing in
 * the file says where a spire ends and the tower under it begins. But the
 * generator does not weld separate objects together: a pinnacle sitting on a
 * pier is its own closed shell, sharing no vertex with anything else. Walking
 * the index buffer with union-find recovers those shells exactly, which is a
 * measurement of the geometry rather than a guess at a gap.
 *
 * Two vertices at the same position but different indices are NOT connected in
 * the index buffer, so components are merged by position as well — otherwise a
 * single part comes back as dozens of unwelded triangle islands.
 *
 * Usage:
 *   node scripts/split-glb-parts.mjs <file.glb> [--min-tris 40] [--top 30]
 *   node scripts/split-glb-parts.mjs <file.glb> --write <out-dir> [--only 3,7,9]
 *
 * Without --write it only reports. With --write it emits one GLB per part,
 * each re-centred on its own footprint with its base at y=0, which is the pivot
 * convention a kit module needs.
 */

import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/split-glb-parts.mjs <file.glb> [--write <dir>] [--min-tris N] [--top N] [--only a,b,c]')
  process.exit(2)
}
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}
const MIN_TRIS = Number(arg('--min-tris', 40))
const TOP = Number(arg('--top', 30))
const WRITE = arg('--write', null)
const ONLY = arg('--only', null)?.split(',').map((s) => Number(s.trim()))

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(file)
const root = doc.getRoot()
const prim = root.listMeshes()[0]?.listPrimitives()[0]
if (!prim) {
  console.error('no primitive in this file')
  process.exit(2)
}

const pos = prim.getAttribute('POSITION')
const nor = prim.getAttribute('NORMAL')
const idxAcc = prim.getIndices()
const vertexCount = pos.getCount()
const indices = []
if (idxAcc) {
  for (let i = 0; i < idxAcc.getCount(); i += 1) indices.push(idxAcc.getScalar(i))
} else {
  for (let i = 0; i < vertexCount; i += 1) indices.push(i)
}
const triCount = indices.length / 3

/** Union-find over vertices. */
const parent = new Int32Array(vertexCount)
for (let i = 0; i < vertexCount; i += 1) parent[i] = i
function find(a) {
  while (parent[a] !== a) {
    parent[a] = parent[parent[a]]
    a = parent[a]
  }
  return a
}
function union(a, b) {
  const ra = find(a)
  const rb = find(b)
  if (ra !== rb) parent[ra] = rb
}

// 1. Weld by position first. Quantised to 1e-5 of the unit box: tight enough
//    that two genuinely separate shells stay separate, loose enough that a
//    duplicated seam vertex does not split one part in half.
const weld = new Map()
const v = [0, 0, 0]
for (let i = 0; i < vertexCount; i += 1) {
  pos.getElement(i, v)
  const key = `${Math.round(v[0] * 1e5)},${Math.round(v[1] * 1e5)},${Math.round(v[2] * 1e5)}`
  const seen = weld.get(key)
  if (seen === undefined) weld.set(key, i)
  else union(i, seen)
}

// 2. Then join every triangle's three corners.
for (let t = 0; t < triCount; t += 1) {
  const a = indices[t * 3]
  const b = indices[t * 3 + 1]
  const c = indices[t * 3 + 2]
  union(a, b)
  union(b, c)
}

/** Group triangles by the component their first corner belongs to. */
const byComponent = new Map()
for (let t = 0; t < triCount; t += 1) {
  const r = find(indices[t * 3])
  let list = byComponent.get(r)
  if (!list) {
    list = []
    byComponent.set(r, list)
  }
  list.push(t)
}

const parts = []
for (const [rootId, tris] of byComponent) {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  const verts = new Set()
  for (const t of tris) {
    for (let k = 0; k < 3; k += 1) {
      const vi = indices[t * 3 + k]
      verts.add(vi)
      pos.getElement(vi, v)
      for (let a = 0; a < 3; a += 1) {
        if (v[a] < lo[a]) lo[a] = v[a]
        if (v[a] > hi[a]) hi[a] = v[a]
      }
    }
  }
  parts.push({
    hi,
    lo,
    rootId,
    size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
    tris,
    vertexCount: verts.size,
  })
}
parts.sort((a, b) => b.tris.length - a.tris.length)

const kept = parts.filter((p) => p.tris.length >= MIN_TRIS)
console.log(`\n=== ${file}`)
console.log(`${triCount} triangles, ${vertexCount} vertices`)
console.log(`connected components: ${parts.length} total, ${kept.length} with >= ${MIN_TRIS} triangles`)
const dust = parts.length - kept.length
if (dust > 0) console.log(`(${dust} components below the threshold are not listed - specks, not parts)`)

console.log(`\n  #   tris   verts    size X      Y      Z     centre X      Y      Z    slenderness`)
kept.slice(0, TOP).forEach((p, i) => {
  const cx = (p.lo[0] + p.hi[0]) / 2
  const cz = (p.lo[2] + p.hi[2]) / 2
  const foot = Math.max(p.size[0], p.size[2])
  const slender = foot > 0 ? p.size[1] / foot : 0
  console.log(
    `  ${String(i).padStart(2)}  ${String(p.tris.length).padStart(5)}  ${String(p.vertexCount).padStart(5)}   ` +
      `${p.size[0].toFixed(4)} ${p.size[1].toFixed(4)} ${p.size[2].toFixed(4)}   ` +
      `${cx.toFixed(4)} ${((p.lo[1] + p.hi[1]) / 2).toFixed(4)} ${cz.toFixed(4)}   ` +
      `${slender.toFixed(2)}`,
  )
})

console.log(
  `\nslenderness = height / widest footprint. Gothic canon puts a pinnacle at 7.0` +
    `\n(docs/gothic-architecture.md, Roriczer 1486), so a component near that is a spire or pinnacle.`,
)
const spires = kept.filter((p) => {
  const foot = Math.max(p.size[0], p.size[2])
  return foot > 0 && p.size[1] / foot >= 2.5
})
console.log(`components with slenderness >= 2.5: ${spires.length}`)

if (!WRITE) {
  console.log(`\n(report only - pass --write <dir> to emit one GLB per part)\n`)
  process.exit(0)
}

fs.mkdirSync(WRITE, { recursive: true })
const chosen = ONLY ? ONLY.map((i) => kept[i]).filter(Boolean) : kept.slice(0, TOP)
const n = [0, 0, 0]
/**
 * Every emitted part, with the size it actually came out at.
 *
 * Written beside the GLBs rather than transcribed into TypeScript by hand. A
 * hand-copied table of forty triples is a place for a wrong digit to live
 * unnoticed for an afternoon, and the sizes are the input to every scale
 * decision downstream.
 */
const manifest = []
for (const [i, p] of chosen.entries()) {
  const index = ONLY ? ONLY[i] : i
  const out = new Document()
  const buffer = out.createBuffer()
  const remap = new Map()
  const P = []
  const NRM = []
  const I = []
  // Re-centre on the footprint, base at y = 0 - the kit pivot convention.
  const ox = (p.lo[0] + p.hi[0]) / 2
  const oy = p.lo[1]
  const oz = (p.lo[2] + p.hi[2]) / 2
  for (const t of p.tris) {
    for (let k = 0; k < 3; k += 1) {
      const vi = indices[t * 3 + k]
      let mapped = remap.get(vi)
      if (mapped === undefined) {
        mapped = P.length / 3
        remap.set(vi, mapped)
        pos.getElement(vi, v)
        P.push(v[0] - ox, v[1] - oy, v[2] - oz)
        if (nor) {
          nor.getElement(vi, n)
          NRM.push(n[0], n[1], n[2])
        }
      }
      I.push(mapped)
    }
  }
  const outPrim = out.createPrimitive()
  outPrim.setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
  if (nor) {
    outPrim.setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(NRM)).setBuffer(buffer))
  }
  outPrim.setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buffer))
  outPrim.setMaterial(out.createMaterial('part'))
  const name = `part-${String(index).padStart(2, '0')}`
  const mesh = out.createMesh(name).addPrimitive(outPrim)
  const node = out.createNode(name).setMesh(mesh)
  out.createScene('scene').addChild(node)
  const dest = path.join(WRITE, `${name}.glb`)
  await io.write(dest, out)
  const foot = Math.max(p.size[0], p.size[2])
  manifest.push({
    id: name,
    size: p.size.map((s) => Number(s.toFixed(4))),
    slenderness: Number((foot > 0 ? p.size[1] / foot : 0).toFixed(2)),
    triangles: p.tris.length,
  })
  console.log(`  wrote ${dest}   ${p.tris.length} tris   ${p.size.map((s) => s.toFixed(3)).join(' x ')}`)
}
const manifestPath = path.join(WRITE, 'parts.json')
fs.writeFileSync(manifestPath, `${JSON.stringify({ parts: manifest, source: path.basename(file) }, null, 2)}\n`)
console.log(`  wrote ${manifestPath}   ${manifest.length} entries`)
console.log('')
