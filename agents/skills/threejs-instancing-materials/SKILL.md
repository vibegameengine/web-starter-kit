---
name: threejs-instancing-materials
description: >-
  Keep Three.js / react-three-fiber draw calls low in this project. Use whenever
  adding repeated 3D objects (props, tiles, foliage, blocks, enemies, particles,
  greybox/blockout geometry) or creating materials. Enforces two rules: (1) batch
  repeated meshes with InstancedMesh (drei <Instances>/<Instance>), never one
  <mesh> per object; (2) define every material and geometry ONCE in the shared
  registry and reuse it — tint per-instance with instance color — never `new
  THREE.Material()` / `new THREE.Geometry()` inline. Shared assets are registered
  with @vibegameengine/shader-warmup so their shaders precompile. Trigger on:
  "too many draw calls", "scene is slow", "add N of these", "spawn", "props",
  "instancing", "material", high draw-call count in r3f-perf.
---

# Instancing & material reuse (draw-call budget)

Every distinct `(geometry, material)` drawn as its own `<mesh>` is **one draw
call** — and shadows roughly double it (a second pass). A blockout with 60 boxes
is 60+ draw calls before lights. That is what makes the scene slow. Two
non-negotiable rules in this project:

## Rule 1 — Batch repeats with InstancedMesh

If you render more than a handful of objects that share a geometry, they MUST go
through one instanced draw call, not N meshes. In r3f use drei's `<Instances>` /
`<Instance>`:

```tsx
import { Instances, Instance } from '@react-three/drei'
import { geometries, materials } from './scene/materials'

// ONE draw call for every box in the scene, regardless of count.
<Instances geometry={geometries.box} material={materials.clay} castShadow receiveShadow>
  {boxes.map((b, i) => (
    <Instance key={i} position={b.pos} scale={b.scale} rotation={b.rot} color={b.color} />
  ))}
</Instances>
```

- Per-instance `position` / `rotation` / `scale` / `color` are free — they live
  in the instance matrix / instanceColor buffer, not new draw calls.
- Group by **geometry**: one `<Instances>` per distinct geometry (box, cone,
  column…). Different *colors* do NOT need different groups — tint per instance.
- For thousands of dynamic instances, drop to a raw `THREE.InstancedMesh` and
  write `instanceMatrix` yourself; set `instanceMatrix.needsUpdate = true`.
- Only keep a standalone `<mesh>` for genuine one-offs (the ground plane, a
  unique hero).

## Rule 2 — Define materials & geometries once, reuse them

Never construct a material or geometry per object or per render. Create each one
**once** at module scope in the shared registry and import it everywhere. Vary
appearance with per-instance color, not new materials.

`src/features/world/materials/materials.ts` is the single source of truth:

```ts
import * as THREE from 'three'
import { ShaderWarmupRegistry } from '@vibegameengine/shader-warmup'

const clay = (color: string, roughness = 0.92) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })

// Reusable, module-scope singletons — import these, never `new` inline.
export const materials = {
  ground: clay('#bcbfc2', 0.98),
  clay: clay('#ffffff', 0.9), // instanced base; tint per-instance with <Instance color>
} as const

export const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 24),
  column: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  ground: new THREE.PlaneGeometry(200, 200, 1, 1),
} as const

// Register every geo/material pair so @vibegameengine/shader-warmup precompiles
// its GPU program before the first visible frame (no first-appearance stutter).
let registered = false
export function registerWarmupResources() {
  if (registered) return
  registered = true
  ShaderWarmupRegistry.register('ground', geometries.ground, materials.ground)
  ShaderWarmupRegistry.register('clay-box', geometries.box, materials.clay)
  ShaderWarmupRegistry.register('clay-cone', geometries.cone, materials.clay)
  ShaderWarmupRegistry.register('clay-column', geometries.column, materials.clay)
}
```

Why module scope: a material created in a component body is rebuilt on every
render, leaks GPU memory, and forces a fresh shader compile. One shared instance
compiles once and batches.

## Verify with r3f-perf

The `<Debug>` overlay (r3f-perf, toggle **P**) shows the live draw-call count.
After instancing, a full greybox scene should read a **single-digit to low-tens**
draw-call count, not 50–100+. If that number climbs when you add content, you
broke one of the rules above — find the per-object `<mesh>` or inline `new
Material()` and fold it back into an `<Instances>` group / the shared registry.

Rough budget for this project: keep steady-state draw calls under ~30 for a
static scene. Shadows, post-processing passes and the sky each add a few — that's
expected and fixed-cost; instanced content is what must stay flat as the world
grows.

This skill covers draw calls (the cost of *one* render). For the other axis —
how many times / how often the scene is re-rendered per frame (shadow pass,
velocity pass), the static/dynamic split, throttling shadows, and baking static
shadows/GI/reflections — see `threejs-scene-architecture`.
