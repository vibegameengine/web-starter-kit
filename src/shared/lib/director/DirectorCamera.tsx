import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { PerspectiveCamera } from 'three'

import { applyCineCamera, CINE_CAMERAS } from './cineCamera'
import { useDirectorSection } from './directorSettings'

type SceneLens = {
  readonly filmGauge: number
  readonly fov: number
}

function restoreSceneLens(camera: PerspectiveCamera, lens: SceneLens): void {
  camera.filmGauge = lens.filmGauge
  camera.fov = lens.fov
  camera.updateProjectionMatrix()
}

export function DirectorCamera() {
  const camera = useThree((state) => state.camera)
  const { focalMm, preset } = useDirectorSection('camera')
  const sceneLens = useMemo<SceneLens | null>(
    () => (camera instanceof PerspectiveCamera ? { filmGauge: camera.filmGauge, fov: camera.fov } : null),
    [camera],
  )

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || sceneLens === null) return
    if (preset === 'scene') {
      restoreSceneLens(camera, sceneLens)
      return
    }
    applyCineCamera(camera, CINE_CAMERAS[preset], focalMm)
  }, [camera, focalMm, preset, sceneLens])

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || sceneLens === null) return
    return () => restoreSceneLens(camera, sceneLens)
  }, [camera, sceneLens])

  return null
}
