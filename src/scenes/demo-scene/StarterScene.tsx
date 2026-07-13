import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { Blockout } from '../../features/world/entities/Blockout'
import { ColoredProps } from '../../features/world/entities/ColoredProps'
import { geometries, materials } from '../../features/world/materials/materials'
import { Relic } from '../../features/world/entities/Relic'
import { Water } from '../../features/world/entities/Water'
import { Tany } from '../../features/character/entities/Tany/Tany'

// Central canal — matches the raised stone reservoir authored in Blockout.
// Surface a touch below the 0.4 kerb top so the water sits inside the rim.
const CANAL_SIZE: [number, number] = [2.4, 10]
const CANAL_POS: [number, number] = [0.4, 4]
const CANAL_LEVEL = 0.28

// One shared sun direction drives the key light and the shadows.
// Rotated 180° horizontally (same elevation, opposite side).
const SUN: [number, number, number] = [40, 52, 34]

// Aerial-perspective haze tinted to the sky's horizon blue so distance reads.
const FOG_COLOR = '#cfe0f4'

function GradientSky() {
  const scene = useThree((state) => state.scene)

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#3d78c9') // deep zenith blue
    grad.addColorStop(0.5, '#7aa9e6')
    grad.addColorStop(1, '#cfe0f4') // pale horizon
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 2, 256)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const previous = scene.background
    scene.background = texture
    return () => {
      scene.background = previous
      texture.dispose()
    }
  }, [scene, texture])

  return null
}

export function StarterScene({ isDancing = false }: { readonly isDancing?: boolean }) {
  return (
    <>
      <GradientSky />
      <fog attach="fog" args={[FOG_COLOR, 34, 94]} />

      {/* Warm KEY light — clean soft shadows without overblown PCF radius. */}
      <directionalLight
        position={SUN}
        intensity={2.8}
        color="#ffe7c2"
        castShadow
        shadow-radius={3.25}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />

      {/* RIM/back light — separates the forms from the background (premium). */}
      <directionalLight position={[10, 8, -18]} intensity={0.8} color="#cfe0ff" />

      {/* Cool sky fill: blue from above, warm bounce from the ground. */}
      <hemisphereLight args={['#8bb4ef', '#b8a99a', 0.55]} />

      {/* Extra cool bounce from the shadow side to keep hue contrast alive. */}
      <directionalLight position={[16, 8, 18]} intensity={0.35} color="#bcd2ec" />

      {/* Low-intensity procedural IBL for gentle specular/ambient on the clay. */}
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={0.7}
          position={[0, 12, 0]}
          rotation-x={Math.PI / 2}
          scale={[24, 24, 1]}
          color="#dfeaf6"
        />
        <Lightformer form="rect" intensity={0.35} position={[-12, 5, -6]} scale={[10, 10, 1]} color="#c3d4ea" />
        <Lightformer form="rect" intensity={0.3} position={[12, 5, 6]} scale={[10, 10, 1]} color="#f0e6d6" />
      </Environment>

      {/* Static world geometry. ShadowGroup records the static/dynamic contract;
          the current renderer still uses one throttled three.js shadow map. */}
      <ShadowGroup kind="static">
        {/* Ground */}
        <mesh
          geometry={geometries.ground}
          material={materials.ground}
          rotation-x={-Math.PI / 2}
          receiveShadow
        />

        <Blockout />
        <ColoredProps />
      </ShadowGroup>

      {/* Water filling the central canal: procedural ripples and a sky fresnel,
          with no separate reflection pass. */}
      <Water size={CANAL_SIZE} position={CANAL_POS} level={CANAL_LEVEL} />

      {/* Dynamic actors: the relic hovers above the canal and Tany can dance.
          Their tag is ready for a later cached-shadow/GI split. */}
      <ShadowGroup kind="dynamic">
        <Relic position={[0.4, 3.4, 5]} scale={1.3} />
        {/* Real Tany character (optimized Tripo GLB) standing on the open floor
            left of the canal, turned toward the camera. */}
        <Tany isDancing={isDancing} position={[3.5, 0, 3.2]} rotationY={0.25} scale={1.25} />
      </ShadowGroup>

      <OrbitControls
        target={[3.4, 1.5, 3]}
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={44}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
    </>
  )
}
