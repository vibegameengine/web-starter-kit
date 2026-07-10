import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

import { PlaceholderCharacter } from '../../features/character/entities/PlaceholderCharacter'

/**
 * Character debug scene — a minimal, self-lit turntable for inspecting a single
 * character entity in isolation (the ECS analogue of a Unity prefab preview).
 * No external HDRI so it works offline; DEV-only, mounted by CharacterDebugScreen
 * behind the /character-debug route.
 */
export function CharacterDebugScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.1, far: 100, position: [3.5, 2.6, 4.5] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#1c2230']} />

      <hemisphereLight args={['#c7d8ff', '#3a3026', 0.7]} />
      <directionalLight
        position={[6, 9, 5]}
        intensity={2.4}
        color="#ffe7c2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.5} color="#bcd2ec" />

      <PlaceholderCharacter position={[0, 0, 0]} />

      {/* Ground catcher for the shadow. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#2a3242" roughness={1} />
      </mesh>
      <Grid
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        sectionSize={2}
        sectionColor="#4a5a7a"
        cellColor="#333c50"
        fadeDistance={30}
        position={[0, 0.001, 0]}
        infiniteGrid
      />

      <OrbitControls target={[0, 1, 0]} enableDamping minDistance={2} maxDistance={20} />
    </Canvas>
  )
}
