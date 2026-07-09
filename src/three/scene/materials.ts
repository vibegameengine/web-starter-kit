import * as THREE from 'three'
import { ShaderWarmupRegistry } from '@vibegameengine/shader-warmup'

/**
 * Single source of truth for the scene's geometries and materials.
 *
 * See .claude/skills/threejs-instancing-materials — every material/geometry is a
 * module-scope singleton created ONCE and reused. Repeated objects are drawn
 * through InstancedMesh (drei <Instances>) and tinted per-instance, so adding
 * content never adds draw calls.
 */

const clay = (color: string, roughness = 0.92): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })

/**
 * Unreal-style blockout grid, drawn once to a CanvasTexture and tiled across the
 * floor: a faint two-tone checker, thin minor lines every 1 unit, and a thick
 * "section" border every 10 units. Used as the ground material's map so the
 * floor still takes lighting, shadows and AO.
 */
function makeGridTexture(): THREE.CanvasTexture {
  const cells = 10 // minor cells per section (one tile)
  const cellPx = 64
  const size = cells * cellPx
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Faint checker so empty cells still read.
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#c4c7cb' : '#bcbfc3'
      ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx)
    }
  }

  // Minor grid lines every unit.
  ctx.strokeStyle = '#9aa0a6'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= cells; i += 1) {
    const p = i * cellPx + 0.5
    ctx.moveTo(p, 0)
    ctx.lineTo(p, size)
    ctx.moveTo(0, p)
    ctx.lineTo(size, p)
  }
  ctx.stroke()

  // Thick section border every 10 units.
  ctx.strokeStyle = '#6b7278'
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(20, 20) // 200-unit ground / 10 units per tile
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const gridFloor = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    map: makeGridTexture(),
    color: '#ffffff',
    roughness: 0.96,
    metalness: 0,
  })

// Reusable clay shades — applied as per-instance colors, not separate materials.
export const shades = {
  mid: '#b7b9bc',
  dark: '#9fa2a6',
  light: '#e9eaec',
} as const

export const materials = {
  ground: gridFloor(),
  // White base for all instanced clay; the real shade comes from <Instance color>.
  clay: clay('#ffffff', 0.9),
} as const

// Unit primitives — scaled per instance in the scene.
export const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 24),
  column: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  sphere: new THREE.SphereGeometry(1, 40, 28),
  torus: new THREE.TorusGeometry(0.7, 0.28, 24, 48),
  ground: new THREE.PlaneGeometry(200, 200, 1, 1),
} as const

const lit = (color: string): THREE.MeshStandardMaterial =>
  // Glossier than the matte clay — material contrast (matte vs glossy) is what
  // reads as "premium" rather than a flat grey tech demo.
  new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.15 })

// Saturated reference props — bright enough that the sky ambient, AO and
// contact shadows around them read clearly against the grey grid floor.
export const colored = {
  red: lit('#d8433a'),
  blue: lit('#3a76d8'),
  green: lit('#4caf50'),
  yellow: lit('#e6b422'),
  violet: lit('#9b59d0'),
} as const

let registered = false

/** Register geo/material pairs so shader-warmup precompiles their programs. */
export function registerWarmupResources(): void {
  if (registered) {
    return
  }
  registered = true

  ShaderWarmupRegistry.register('ground', geometries.ground, materials.ground)
  ShaderWarmupRegistry.register('clay-box', geometries.box, materials.clay)
  ShaderWarmupRegistry.register('clay-cone', geometries.cone, materials.clay)
  ShaderWarmupRegistry.register('clay-column', geometries.column, materials.clay)
  ShaderWarmupRegistry.register('colored-sphere', geometries.sphere, colored.red)
  ShaderWarmupRegistry.register('colored-torus', geometries.torus, colored.yellow)
}
