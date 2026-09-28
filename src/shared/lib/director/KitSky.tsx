import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

const KIT_HORIZON_COLOR = '#cfe0f4'
const KIT_ZENITH_COLOR = '#3d78c9'
const KIT_MID_SKY_COLOR = '#7aa9e6'
const HAZE_NEAR_METRES = 34
const HAZE_FAR_METRES = 94

function createSkyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const context = canvas.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, KIT_ZENITH_COLOR)
  gradient.addColorStop(0.5, KIT_MID_SKY_COLOR)
  gradient.addColorStop(1, KIT_HORIZON_COLOR)
  context.fillStyle = gradient
  context.fillRect(0, 0, 2, 256)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

let skyTexture: CanvasTexture | null = null

function kitSkyTexture(): CanvasTexture {
  skyTexture ??= createSkyTexture()
  return skyTexture
}

export function KitSky() {
  const scene = useThree((state) => state.scene)

  /* eslint-disable react-hooks/immutability -- the scene background is renderer state owned by three, not React state */
  useEffect(() => {
    const previous = scene.background
    scene.background = kitSkyTexture()
    return () => {
      scene.background = previous
    }
  }, [scene])
  /* eslint-enable react-hooks/immutability */

  return <fog args={[KIT_HORIZON_COLOR, HAZE_NEAR_METRES, HAZE_FAR_METRES]} attach="fog" />
}
