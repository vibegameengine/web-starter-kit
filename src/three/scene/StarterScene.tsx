import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { ShadowGroup } from '../ShadowGroup'
import { Blockout } from './Blockout'
import { ColoredProps } from './ColoredProps'
import { geometries, materials } from './materials'

// One shared sun direction drives the key light and the shadows.
// Rotated 180° horizontally (same elevation, opposite side).
const SUN: [number, number, number] = [40, 52, 34]

// Aerial-perspective haze tinted to the sky's horizon blue so distance reads.
const FOG_COLOR = '#cfe0f4'

/**
 * Blue gradient sky painted onto scene.background.
 */
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

export function StarterScene() {
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

      {/* The whole world is static right now — tag it so the future shadow (and
          GI) split can bake it once. Dynamic units will get their own
          <ShadowGroup kind="dynamic"> when they're added. */}
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

      <OrbitControls
        target={[0, 2.4, -1]}
        enableDamping
        dampingFactor={0.08}
        minDistance={7}
        maxDistance={44}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
    </>
  )
}
