import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'

import { geometries, materials, shades } from './materials'

/**
 * Procedural greybox "blockout" — stacked box buildings, a cone forest, a ruined
 * colonnade with a fallen lintel, and ground slabs. Layout is generated once
 * from a fixed seed so it's stable across reloads, screenshots and warmup.
 *
 * Per the threejs-instancing-materials skill: every object is an <Instance>
 * inside a geometry-keyed <Instances> group, so the whole blockout is just THREE
 * draw calls (box / cone / column) no matter how many pieces it contains.
 */

type Item = {
  pos: [number, number, number]
  scale: [number, number, number]
  rot?: [number, number, number]
  color: string
}

type Groups = { box: Item[]; cone: Item[]; column: Item[] }

// Small deterministic RNG (mulberry32) — no Math.random, so layout is stable.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildGroups(): Groups {
  const rng = makeRng(20260709)
  const range = (lo: number, hi: number) => lo + rng() * (hi - lo)
  const g: Groups = { box: [], cone: [], column: [] }

  const box = (
    pos: [number, number, number],
    scale: [number, number, number],
    color: string = shades.mid,
    rot?: [number, number, number],
  ) => g.box.push({ pos, scale, color, rot })

  // Rest a box of height h on the ground at (x, z).
  const building = (x: number, z: number, w: number, d: number, h: number, color: string) =>
    box([x, h / 2, z], [w, h, d], color)

  // --- Side clusters: chunky stacked "buildings" left and right ---
  for (const side of [-1, 1]) {
    const baseX = side * range(9, 11)
    for (let i = 0; i < 7; i += 1) {
      const x = baseX + side * range(-2.5, 2.5)
      const z = range(-12, -2)
      const h = range(2.5, 8)
      building(x, z, range(2, 4), range(2, 4), h, rng() > 0.5 ? shades.mid : shades.dark)
      if (rng() > 0.55) {
        box([x + range(-0.6, 0.6), h + range(0.5, 1.2), z], [range(1, 2), range(1, 2.5), range(1, 2)], shades.dark)
      }
    }
  }

  // --- Back skyline: a stepped wall of blocks fading into the fog ---
  for (let i = 0; i < 14; i += 1) {
    const x = -14 + (i / 13) * 28 + range(-0.6, 0.6)
    building(x, -14 + range(-1.5, 1.5), range(2.2, 3.4), range(2, 3), range(3, 9), rng() > 0.5 ? shades.mid : shades.dark)
  }

  // --- Central ruined colonnade ---
  const colZ = -6
  const colH = 5.2
  for (let i = 0; i < 5; i += 1) {
    const x = -4 + i * 2
    g.column.push({ pos: [x, colH / 2, colZ], scale: [1, colH, 1], color: shades.light })
    box([x, colH + 0.25, colZ], [1.4, 0.5, 1.4], shades.light) // capital
  }
  box([-2, colH + 0.75, colZ], [5.2, 0.7, 1.5], shades.light) // intact lintel
  box([3.6, colH + 0.2, colZ], [4.6, 0.7, 1.5], shades.light, [0, 0, -0.24]) // fallen beam

  // --- Cone "forest" scattered across the mid ground ---
  // All five rng() draws happen every iteration (h, x, z, sx, sz) so the layout
  // stays stable; we just skip the central cones (|x| < 3) so they don't block
  // the colonnade — the ones off to the sides stay.
  for (let i = 0; i < 10; i += 1) {
    const h = range(1.6, 4)
    const x = range(-7, 7)
    const z = range(-4, 3)
    const sx = range(0.9, 1.6)
    const sz = range(0.9, 1.6)
    if (Math.abs(x) < 3) {
      continue
    }
    g.cone.push({ pos: [x, h / 2, z], scale: [sx, h, sz], color: shades.light })
  }

  // --- Foreground ground slabs (thin flat pads) ---
  for (let i = 0; i < 6; i += 1) {
    box([range(-9, 9), 0.12, range(4, 9)], [range(1.6, 3), 0.24, range(1.6, 3)], shades.mid, [0, range(0, Math.PI), 0])
  }

  return g
}

function InstanceGroup({ geo, items }: { geo: keyof typeof geometries; items: Item[] }) {
  return (
    <Instances geometry={geometries[geo]} material={materials.clay} limit={items.length} castShadow receiveShadow>
      {items.map((it, i) => (
        <Instance key={i} position={it.pos} scale={it.scale} rotation={it.rot} color={it.color} />
      ))}
    </Instances>
  )
}

export function Blockout() {
  const groups = useMemo(buildGroups, [])

  return (
    <group>
      <InstanceGroup geo="box" items={groups.box} />
      <InstanceGroup geo="cone" items={groups.cone} />
      <InstanceGroup geo="column" items={groups.column} />
    </group>
  )
}
