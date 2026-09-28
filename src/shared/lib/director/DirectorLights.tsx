import { Environment, Lightformer } from '@react-three/drei'
import { useMemo } from 'react'
import type { RefObject } from 'react'
import type { Object3D } from 'three'

import { SunShadow } from '../SunShadow'
import { DEFAULT_DIRECTOR_SETTINGS, KIT_SUN_DISTANCE, useDirectorSection } from './directorSettings'
import { anglesFromOffset, offsetFromAngles, stopsToGain, withChroma, type Vector3Tuple } from './lightGeometry'

const KIT_FILL_ANGLES = anglesFromOffset([-16, 8, -18])
const FILL_AZIMUTH_FROM_SUN_DEG = KIT_FILL_ANGLES.azimuthDeg - DEFAULT_DIRECTOR_SETTINGS.sun.azimuthDeg
const RIM_POSITION: Vector3Tuple = [10, 8, -18]
const RIM_COLOR = '#cfe0ff'

export type DirectorSunOverrides = {
  readonly color?: string
  readonly follow?: RefObject<Object3D | null>
  readonly intensity?: number
  readonly offset?: Vector3Tuple
  readonly radius: number
}

export type DirectorPalette = {
  readonly fill?: string
  readonly ground?: string
  readonly sky?: string
}

type DirectorLightsProps = {
  readonly ambientScale?: number
  readonly environment?: boolean
  readonly environmentBackdrop?: string
  readonly palette?: DirectorPalette
  readonly rim?: boolean
  readonly sun: DirectorSunOverrides
}

function DirectorSun({ color, follow, intensity, offset, radius }: DirectorSunOverrides) {
  const sun = useDirectorSection('sun')
  const directedOffset = useMemo(
    () => offsetFromAngles({ azimuthDeg: sun.azimuthDeg, distance: KIT_SUN_DISTANCE, elevationDeg: sun.elevationDeg }),
    [sun.azimuthDeg, sun.elevationDeg],
  )
  const resolvedIntensity = intensity ?? sun.intensity
  if (resolvedIntensity <= 0) return null

  return (
    <SunShadow
      color={color ?? sun.color}
      follow={follow}
      intensity={resolvedIntensity}
      offset={offset ?? directedOffset}
      radius={radius}
    />
  )
}

function useFillPosition(): Vector3Tuple {
  const { azimuthDeg } = useDirectorSection('sun')
  return useMemo(
    () => offsetFromAngles({ ...KIT_FILL_ANGLES, azimuthDeg: azimuthDeg + FILL_AZIMUTH_FROM_SUN_DEG }),
    [azimuthDeg],
  )
}

function KitEnvironment({ backdrop, intensity }: { readonly backdrop?: string; readonly intensity: number }) {
  return (
    <Environment environmentIntensity={intensity} frames={1} resolution={128}>
      {backdrop ? <color args={[backdrop]} attach="background" /> : null}
      <Lightformer color="#dfeaf6" form="rect" intensity={0.7} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
      <Lightformer color="#c3d4ea" form="rect" intensity={0.35} position={[-12, 5, -6]} scale={[10, 10, 1]} />
      <Lightformer color="#f0e6d6" form="rect" intensity={0.3} position={[12, 5, 6]} scale={[10, 10, 1]} />
    </Environment>
  )
}

export function DirectorLights({ ambientScale = 1, environment = true, environmentBackdrop, palette, rim = false, sun }: DirectorLightsProps) {
  const ambient = useDirectorSection('ambient')
  const fillPosition = useFillPosition()
  const indirectGain = stopsToGain(ambient.indirectEV) * ambientScale
  const sky = withChroma(palette?.sky ?? ambient.skyColor, ambient.indirectChroma)
  const ground = withChroma(palette?.ground ?? ambient.groundColor, ambient.indirectChroma)
  const fill = withChroma(palette?.fill ?? ambient.fillColor, ambient.indirectChroma)

  return (
    <>
      <DirectorSun {...sun} />
      <hemisphereLight color={sky} groundColor={ground} intensity={ambient.hemisphereIntensity * indirectGain} />
      <directionalLight color={fill} intensity={ambient.fillIntensity * indirectGain} position={fillPosition} />
      {rim ? <directionalLight color={RIM_COLOR} intensity={ambient.rimIntensity} position={RIM_POSITION} /> : null}
      {environment ? <KitEnvironment backdrop={environmentBackdrop} intensity={ambient.environmentIntensity * indirectGain} /> : null}
    </>
  )
}
