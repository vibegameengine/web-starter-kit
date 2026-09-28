import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

import { LabStage } from '../../../scenes/lab-stage/LabStage'
import { ShadowGroup } from '../../../shared/lib/ShadowGroup'
import { DEFAULT_DIRECTOR_SETTINGS } from '../../../shared/lib/director/directorSettings'
import { lookDevResources } from '../materials/lookDevResources'

type Vector3Tuple = [number, number, number]

const SUN_YAW = (DEFAULT_DIRECTOR_SETTINGS.sun.azimuthDeg * Math.PI) / 180
const TOWARD_SUN = { x: Math.sin(SUN_YAW), z: Math.cos(SUN_YAW) }
const ALONG_WALL = { x: TOWARD_SUN.z, z: -TOWARD_SUN.x }

const WALL_HEIGHT = 2.4
const WALL_LENGTH = 4.4
const WALL_THICKNESS = 0.3
const BALL_RADIUS = 0.35
const MOVER_RADIUS = 0.42
const CHART_SIZE: Vector3Tuple = [1.5, 1, 1]
const MOVER_NEAREST_BEHIND_WALL = 0.7
const MOVER_FARTHEST_BEHIND_WALL = 3.9
const MOVER_SWING_PERIOD_SECONDS = 9

function placed(towardSun: number, alongWall: number, height: number): Vector3Tuple {
  return [
    TOWARD_SUN.x * towardSun + ALONG_WALL.x * alongWall,
    height,
    TOWARD_SUN.z * towardSun + ALONG_WALL.z * alongWall,
  ]
}

function moverDistanceBehindWall(seconds: number): number {
  const phase = 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds) / MOVER_SWING_PERIOD_SECONDS)
  return MOVER_NEAREST_BEHIND_WALL + (MOVER_FARTHEST_BEHIND_WALL - MOVER_NEAREST_BEHIND_WALL) * phase
}

const WALL_POSITION = placed(0, 0, WALL_HEIGHT / 2)
const MIDDLE_GREY_BALL_POSITION = placed(1.7, 1, BALL_RADIUS)
const CHROME_BALL_POSITION = placed(1.7, -0.2, BALL_RADIUS)
const CHART_YAW = SUN_YAW + Math.PI / 4
const CHART_POSITION = placed(1.9, -1.6, 0.62)
const CHART_FRAME_POSITION: Vector3Tuple = [
  CHART_POSITION[0] - Math.sin(CHART_YAW) * 0.03,
  CHART_POSITION[1],
  CHART_POSITION[2] - Math.cos(CHART_YAW) * 0.03,
]

function ShadowCrossingMover() {
  const mover = useRef<Mesh>(null)
  const { geometries, materials } = lookDevResources()

  useFrame(({ clock }) => {
    if (!mover.current) return
    const [x, , z] = placed(-moverDistanceBehindWall(clock.elapsedTime), 0.4, MOVER_RADIUS)
    mover.current.position.set(x, MOVER_RADIUS, z)
  })

  return (
    <mesh
      ref={mover}
      castShadow
      geometry={geometries.sphere}
      material={materials.mover}
      receiveShadow
      scale={MOVER_RADIUS}
    />
  )
}

export function DirectorLookLabScreen() {
  const { geometries, materials } = lookDevResources()

  return (
    <LabStage
      camera={{ far: 120, fov: 38, near: 0.1, position: placed(3.2, 8.4, 3.4) }}
      orbit={{ maxDistance: 30, minDistance: 3, target: placed(0.2, 0.2, 0.8) }}
      post="rich"
      sun={{ radius: 9 }}
    >
      <ShadowGroup kind="static">
        <mesh
          castShadow
          geometry={geometries.box}
          material={materials.clay}
          position={WALL_POSITION}
          receiveShadow
          rotation-y={SUN_YAW}
          scale={[WALL_LENGTH, WALL_HEIGHT, WALL_THICKNESS]}
        />
        <mesh
          castShadow
          geometry={geometries.sphere}
          material={materials.middleGrey}
          position={MIDDLE_GREY_BALL_POSITION}
          receiveShadow
          scale={BALL_RADIUS}
        />
        <mesh
          castShadow
          geometry={geometries.sphere}
          material={materials.chrome}
          position={CHROME_BALL_POSITION}
          receiveShadow
          scale={BALL_RADIUS}
        />
        <mesh
          castShadow
          geometry={geometries.box}
          material={materials.frame}
          position={CHART_FRAME_POSITION}
          receiveShadow
          rotation-y={CHART_YAW}
          scale={[CHART_SIZE[0] + 0.08, CHART_SIZE[1] + 0.08, 0.04]}
        />
        <mesh
          geometry={geometries.chart}
          material={materials.chart}
          position={CHART_POSITION}
          receiveShadow
          rotation-y={CHART_YAW}
          scale={CHART_SIZE}
        />
      </ShadowGroup>

      <ShadowGroup kind="dynamic">
        <ShadowCrossingMover />
      </ShadowGroup>
    </LabStage>
  )
}
