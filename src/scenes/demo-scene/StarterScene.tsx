import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { DirectorLights } from '../../shared/lib/director/DirectorLights'
import { Blockout } from '../../features/world/entities/Blockout'
import { ColoredProps } from '../../features/world/entities/ColoredProps'
import { geometries, materials } from '../../features/world/materials/materials'
import { Relic } from '../../features/world/entities/Relic'
import { Water } from '../../features/world/entities/Water'
import { Tany } from '../../features/character/entities/Tany/Tany'
import type { TanyAnimation } from '../../features/character/entities/Tany/Tany'

const CANAL_SIZE: [number, number] = [2.4, 10]
const CANAL_POS: [number, number] = [0.4, 4]
const CANAL_WATER_LEVEL = 0.28

const SUN_SHADOW_RADIUS = 20

const HORIZON_HAZE_COLOR = '#cfe0f4'

function GradientSky() {
  const scene = useThree((state) => state.scene)

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#3d78c9')
    grad.addColorStop(0.5, '#7aa9e6')
    grad.addColorStop(1, HORIZON_HAZE_COLOR)
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

type StarterSceneProps = {
  readonly isDancing?: boolean
  readonly onGreeting?: () => void
  readonly onGreetingFinished?: () => void
  readonly onGreetingVoiceFinished?: () => void
  readonly tanyAnimation?: TanyAnimation
}

export function StarterScene({
  isDancing = false,
  onGreeting,
  onGreetingFinished,
  onGreetingVoiceFinished,
  tanyAnimation,
}: StarterSceneProps) {
  return (
    <>
      <GradientSky />
      <fog attach="fog" args={[HORIZON_HAZE_COLOR, 34, 94]} />

      <DirectorLights environment rim sun={{ radius: SUN_SHADOW_RADIUS }} />

      <ShadowGroup kind="static">
        <mesh
          geometry={geometries.ground}
          material={materials.ground}
          rotation-x={-Math.PI / 2}
          receiveShadow
        />

        <Blockout />
        <ColoredProps />
      </ShadowGroup>

      <Water size={CANAL_SIZE} position={CANAL_POS} level={CANAL_WATER_LEVEL} />

      <ShadowGroup kind="dynamic">
        <Relic position={[0.4, 3.4, 5]} scale={1.3} />
        <Tany
          animation={tanyAnimation}
          isDancing={isDancing}
          onGreeting={onGreeting}
          onGreetingFinished={onGreetingFinished}
          onGreetingVoiceFinished={onGreetingVoiceFinished}
          position={[3.5, 0, 3.2]}
          rotationY={0.25}
          scale={1.25}
        />
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
