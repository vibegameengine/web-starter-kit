import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { Water } from './Water'

/**
 * A single stone fountain: a round basin (rim wall + rounded lip + central
 * pedestal and spout, all MERGED into ONE geometry so the whole stonework is a
 * single draw call), a mosaic-tiled floor, the reflective/refractive Water disc,
 * and a particle jet spouting from the top and falling back into the pool.
 *
 * Local geometry sits on the ground (y = 0); the whole thing is placed via
 * `center`. Keep `radius`/heights in sync with the <Water> disc below.
 */

const RIM_TOP = 0.5 // stone rim height above the ground
const WATER_LEVEL = 0.42 // still-water surface (just below the rim)
const FLOOR_TOP = 0.1 // basin floor height → water is ~0.32 deep
const SPOUT_Y = 1.28 // where the jet leaves the top bowl

type FountainProps = {
  center?: [number, number]
  radius?: number
  particles?: number
}

/** Soft round sprite for the water droplets (radial alpha falloff). */
function makeDropTexture(): THREE.CanvasTexture {
  const s = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(228,242,247,0.7)')
  g.addColorStop(1, 'rgba(228,242,247,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Teal mosaic for the basin floor, seen through the water via refraction. */
function makeTileTexture(): THREE.CanvasTexture {
  const s = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#123b45'
  ctx.fillRect(0, 0, s, s)
  const cells = 8
  const c = s / cells
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const t = (x * 7 + y * 13) % 5
      ctx.fillStyle = ['#1d6b76', '#2a8791', '#17565f', '#238089', '#1a626c'][t]
      ctx.fillRect(x * c + 1.5, y * c + 1.5, c - 3, c - 3)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  return tex
}

export function Fountain({ center = [0, 8], radius = 2.2, particles = 500 }: FountainProps) {
  // --- Merged stone geometry (one draw call) --------------------------------
  const stoneGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []

    // Outer rim wall (open tube).
    const wall = new THREE.CylinderGeometry(radius, radius, RIM_TOP, 72, 1, true)
    wall.translate(0, RIM_TOP / 2, 0)
    parts.push(wall)

    // Rounded lip along the top edge.
    const lip = new THREE.TorusGeometry(radius, 0.08, 12, 72)
    lip.rotateX(Math.PI / 2)
    lip.translate(0, RIM_TOP, 0)
    parts.push(lip)

    // Central pedestal from the floor up to the spout.
    const column = new THREE.CylinderGeometry(0.16, 0.24, SPOUT_Y - FLOOR_TOP, 28)
    column.translate(0, FLOOR_TOP + (SPOUT_Y - FLOOR_TOP) / 2, 0)
    parts.push(column)

    // Small top bowl the water brims over.
    const bowl = new THREE.CylinderGeometry(0.42, 0.18, 0.16, 28)
    bowl.translate(0, SPOUT_Y - 0.02, 0)
    parts.push(bowl)
    const bowlLip = new THREE.TorusGeometry(0.42, 0.05, 10, 28)
    bowlLip.rotateX(Math.PI / 2)
    bowlLip.translate(0, SPOUT_Y + 0.06, 0)
    parts.push(bowlLip)

    const merged = mergeGeometries(parts, false)!
    parts.forEach((p) => p.dispose())
    return merged
  }, [radius])

  const stoneMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c7c0b2',
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide, // the open rim tube is seen from inside too
      }),
    [],
  )

  const floorGeo = useMemo(() => new THREE.CircleGeometry(radius - 0.04, 72), [radius])
  const floorMat = useMemo(() => {
    const map = makeTileTexture()
    return new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0 })
  }, [])

  // --- Particle jet ---------------------------------------------------------
  const dropTex = useMemo(() => makeDropTexture(), [])
  const pointsMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        map: dropTex,
        size: 0.11,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false, // don't corrupt the water's depth-capture pre-pass
        opacity: 0.85,
        color: '#dff1f6',
      }),
    [dropTex],
  )

  const jet = useMemo(() => {
    const positions = new Float32Array(particles * 3)
    const vel = new Float32Array(particles * 3)
    const life = new Float32Array(particles)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    // Stagger initial ages so the plume is full immediately, not a pulse.
    for (let i = 0; i < particles; i += 1) {
      life[i] = (i / particles) * 1.2
      positions[i * 3 + 1] = -100 // parked below until first spawn
    }
    return { geo, positions, vel, life }
  }, [particles])

  useEffect(() => {
    return () => {
      stoneGeo.dispose()
      stoneMat.dispose()
      floorGeo.dispose()
      floorMat.map?.dispose()
      floorMat.dispose()
      jet.geo.dispose()
      pointsMat.dispose()
      dropTex.dispose()
    }
  }, [stoneGeo, stoneMat, floorGeo, floorMat, jet, pointsMat, dropTex])

  const pointsRef = useRef<THREE.Points>(null)

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05) // clamp after tab-outs so nothing teleports
    const { positions, vel, life } = jet
    const g = -6.5

    for (let i = 0; i < particles; i += 1) {
      const j = i * 3
      life[i] -= dt
      if (life[i] <= 0 || positions[j + 1] < WATER_LEVEL) {
        // Respawn at the spout with a mostly-upward, slightly splayed velocity.
        const a = (i * 12.9898) % (Math.PI * 2)
        const spread = 0.35 + (i % 7) * 0.06
        positions[j] = Math.cos(a) * 0.05
        positions[j + 1] = SPOUT_Y + 0.05
        positions[j + 2] = Math.sin(a) * 0.05
        vel[j] = Math.cos(a) * spread
        vel[j + 1] = 2.5 + (i % 5) * 0.18
        vel[j + 2] = Math.sin(a) * spread
        life[i] = 1.1 + (i % 9) * 0.05
      } else {
        vel[j + 1] += g * dt
        positions[j] += vel[j] * dt
        positions[j + 1] += vel[j + 1] * dt
        positions[j + 2] += vel[j + 2] * dt
      }
    }
    jet.geo.attributes.position.needsUpdate = true
  })

  return (
    <group>
      <group position={[center[0], 0, center[1]]}>
        <mesh geometry={stoneGeo} material={stoneMat} castShadow receiveShadow />
        <mesh geometry={floorGeo} material={floorMat} rotation-x={-Math.PI / 2} position-y={FLOOR_TOP} receiveShadow />
        <points ref={pointsRef} geometry={jet.geo} material={pointsMat} position-y={0} />
      </group>

      <Water level={WATER_LEVEL} size={[(radius - 0.06) * 2, (radius - 0.06) * 2]} position={center} />
    </group>
  )
}
