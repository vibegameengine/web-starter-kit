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
  { geo: 'sphere', mat: colored.red, pos: [-4.5, 1.2, 3.5], scale: [1.2, 1.2, 1.2] },
  { geo: 'box', mat: colored.blue, pos: [-0.5, 1.1, 4.6], scale: [2.2, 2.2, 2.2] },
  { geo: 'cone', mat: colored.green, pos: [3.6, 1.4, 3.4], scale: [1.5, 2.8, 1.5] },
  { geo: 'torus', mat: colored.yellow, pos: [1.6, 0.9, 2.4], scale: [1.3, 1.3, 1.3], rot: [Math.PI / 2, 0, 0] },
  { geo: 'sphere', mat: colored.violet, pos: [5.4, 0.85, 1.4], scale: [0.85, 0.85, 0.85] },
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
