import type { Material } from 'three'

import { colored, geometries } from './materials'

/**
 * A few saturated reference shapes on the grid. They're distinct one-offs (not
 * repeated), so individual meshes are fine here — but their geometries and
 * materials still come from the shared registry, never `new` inline.
 *
 * Their job: make the lighting readable — you can see the warm key on the lit
 * side, the cool sky fill on the shadow side, and the AO / contact shadow
 * pooling where each shape meets the floor.
 */
type Prop = {
  geo: keyof typeof geometries
  mat: Material
  pos: [number, number, number]
  scale?: [number, number, number]
  rot?: [number, number, number]
}

const PROPS: Prop[] = [
  { geo: 'box', mat: colored.red, pos: [-6.5, 0.9, -1.5], scale: [1.8, 1.8, 1.8], rot: [0, 0.5, 0] },
  { geo: 'box', mat: colored.green, pos: [4.5, 1.0, -2], scale: [2.0, 2.0, 2.0], rot: [0, -0.4, 0] },
  { geo: 'box', mat: colored.violet, pos: [6.5, 0.65, -3.5], scale: [1.3, 1.3, 1.3], rot: [0, 0.3, 0] },
]

export function ColoredProps() {
  return (
    <group>
      {PROPS.map((p, i) => (
        <mesh
          key={i}
          geometry={geometries[p.geo]}
          material={p.mat}
          position={p.pos}
          scale={p.scale}
          rotation={p.rot}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
