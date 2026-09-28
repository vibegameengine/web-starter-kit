import { OrbitControls } from '@react-three/drei'

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
      <DirectorLights environment rim sky sun={{ radius: SUN_SHADOW_RADIUS }} />

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
