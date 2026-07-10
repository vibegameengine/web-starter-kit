import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'

import { geometries, materials, shades } from '../materials/materials'

/**
 * Hand-authored greybox "blockout" — every block, column and cone is placed
 * deliberately (AGENTS.md #3 + threejs-scene-authoring: NO procedural/RNG scene
 * generation).
 *
 * Composition:
 *  - HERO: a ruined colonnade, dead centre at mid-depth (z ≈ -6), standing in an
 *    open gap of the back skyline so it silhouettes against the sky.
 *  - FRAMING: tall building masses anchor the left and right edges and step back
 *    into the haze, pushing the eye inward.
 *  - BACK SKYLINE: a stepped row of blocks on each side, with a deliberate gap
 *    behind the colonnade.
 *  - CONES ("trees"): clustered off to the sides (|x| ≥ ~3.4) so the centre-front
 *    stays open; a couple flank the colonnade to frame it.
 *  - FOREGROUND: thin slabs lead the eye in; the centre-front is intentionally
 *    kept clear.
 *
 * Layout is authored DATA; rendering still batches through <Instances>, so the
 * whole blockout stays at three draw calls (see threejs-instancing-materials).
 */

type Item = {
  pos: [number, number, number]
  scale: [number, number, number]
  rot?: [number, number, number]
  color: string
}

type Groups = { box: Item[]; cone: Item[]; column: Item[] }

function buildGroups(): Groups {
  const g: Groups = { box: [], cone: [], column: [] }

  const box = (
    pos: [number, number, number],
    scale: [number, number, number],
    color: string = shades.mid,
    rot?: [number, number, number],
  ) => g.box.push({ pos, scale, color, rot })

  // A building rests on the ground at (x,z) with footprint w×d and height h.
  const building = (x: number, z: number, w: number, d: number, h: number, color: string) =>
    box([x, h / 2, z], [w, h, d], color)

  const cone = (x: number, z: number, h: number, r: number) =>
    g.cone.push({ pos: [x, h / 2, z], scale: [r, h, r], color: shades.light })

  const column = (x: number, z: number, h: number) =>
    g.column.push({ pos: [x, h / 2, z], scale: [1, h, 1], color: shades.light })

  // --- LEFT framing mass: tall anchor, stepping back into the haze ---
  building(-9, -3, 3.8, 3.5, 7.5, shades.dark) // near-left anchor (tallest, closest)
  box([-9, 7.9, -3], [2.4, 2, 2.2], shades.mid) // stacked topper on the anchor
  building(-11.5, -6.5, 3.2, 3, 5.8, shades.mid) // one step back and down
  building(-13, -10, 3, 3, 4.5, shades.dark) // furthest, lowest, fading into fog
  building(-7, -1, 2.6, 2.8, 3.2, shades.mid) // low block hugging the front edge

  // --- RIGHT framing mass: the big near-right wall, stepping back ---
  building(9.5, -3.5, 4, 3.6, 8, shades.mid) // near-right anchor (biggest mass)
  box([9.5, 8.4, -3.5], [2.6, 2, 2.4], shades.dark) // stacked topper
  building(12, -7, 3.2, 3, 6, shades.dark) // step back
  building(13.5, -11, 3, 3, 4.5, shades.mid) // furthest, into fog
  building(8, -1, 2.8, 3, 3.4, shades.dark) // low block at the front-right edge

  // --- BACK skyline: stepped blocks each side, GAP behind the colonnade ---
  building(-12, -14, 2.6, 2.4, 4.5, shades.mid)
  building(-9.5, -13.5, 2.8, 2.6, 6, shades.dark)
  building(-7, -14.5, 2.4, 2.4, 5, shades.mid)
  building(-5, -14, 2.6, 2.5, 6.5, shades.dark)
  // (gap x ∈ [-4, 4] — colonnade reads against open sky)
  building(5, -14, 2.6, 2.5, 6.5, shades.dark)
  building(7, -14.5, 2.4, 2.4, 5, shades.mid)
  building(9.5, -13.5, 2.8, 2.6, 6, shades.dark)
  building(12, -14, 2.6, 2.4, 4.5, shades.mid)

  // --- HERO: ruined colonnade at z = -6 ---
  const colZ = -6
  // Five columns of deliberately uneven height; the 4th (x=2) is broken short.
  const columns: Array<[number, number, boolean]> = [
    [-4, 5.2, true], // x, height, has capital
    [-2, 5.4, true],
    [0, 5.0, true],
    [2, 4.2, false], // broken stump — no capital
    [4, 5.2, true],
  ]
  for (const [x, h, capital] of columns) {
    column(x, colZ, h)
    if (capital) {
      box([x, h + 0.25, colZ], [1.4, 0.5, 1.4], shades.light) // capital block
    }
  }
  // Intact lintel spanning the left three columns.
  box([-2, 5.9, colZ], [4.8, 0.6, 1.4], shades.light)
  // Fallen beam, tilted, dropped across the broken right side.
  box([3, 4.8, colZ], [4.6, 0.6, 1.4], shades.light, [0, 0, 0.16])

  // --- CONES: side clusters framing the open centre ---
  // Left cluster leads the eye in from the front-left.
  cone(-5, -1, 4, 1.4) // hero cone (tall)
  cone(-6.3, -2.6, 2.6, 1.1)
  cone(-4, -3.2, 2.2, 1.0)
  // Right cluster balances it.
  cone(5.5, -1.5, 3.4, 1.3)
  cone(6.8, -3, 2.5, 1.1)
  // A cone just outside each end of the colonnade to frame the hero.
  cone(-3.5, -4.5, 3, 1.1)
  cone(4, -4.5, 2.8, 1.05)

  // --- CANAL down the centre (raised stone reservoir holding the water) ---
  // Footprint: x ∈ [-0.8, 1.6], z ∈ [-1, 9]; water surface sits inside the rim.
  // Dark basin floor so the water reads deep, not like a puddle on the grid.
  box([0.4, 0.03, 4], [2.5, 0.06, 10.1], shades.dark)
  // Four low cut-stone curbs forming the rim (top at y=0.4; water level below it).
  box([-0.95, 0.2, 4], [0.3, 0.4, 10.4], shades.light) // left kerb (runs along z)
  box([1.75, 0.2, 4], [0.3, 0.4, 10.4], shades.light) // right kerb
  box([0.4, 0.2, -1.15], [3.0, 0.4, 0.3], shades.light) // far end (toward colonnade)
  box([0.4, 0.2, 9.15], [3.0, 0.4, 0.3], shades.light) // near end (foreground)

  // --- FOREGROUND slabs: thin pads flanking the canal, leading the eye in ---
  box([-3, 0.12, 5.5], [2.4, 0.24, 2.4], shades.mid, [0, 0.2, 0]) // left of canal
  box([-5, 0.12, 7.2], [2, 0.24, 2], shades.mid, [0, 0.1, 0]) // further left
  box([4, 0.12, 5], [2.2, 0.24, 2.6], shades.mid, [0, 0.35, 0]) // right of canal
  box([3.5, 0.12, 8], [2, 0.24, 2.2], shades.mid, [0, -0.2, 0]) // further right

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
