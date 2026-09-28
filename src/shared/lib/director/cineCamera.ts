import type { PerspectiveCamera } from 'three'

export type CineCamera = {
  readonly focalMm: number
  readonly iso: number
  readonly label: string
  readonly note: string
  readonly sensorHeightMm: number
  readonly sensorWidthMm: number
  readonly shutterAngleDeg: number
  readonly squeeze: number
  readonly tStop: number
}

const REFERENCE_EXPOSURE = { iso: 800, shutterAngleDeg: 180, tStop: 2.8 }

export const CINE_CAMERAS = {
  'alexa35-32': {
    label: 'ARRI ALEXA 35 · Master Prime 32 mm',
    sensorWidthMm: 27.99, sensorHeightMm: 19.22, focalMm: 32, shutterAngleDeg: 180, iso: 800, tStop: 1.3, squeeze: 1,
    note: '4.6K 3:2 open gate, the current ARRI workhorse',
  },
  'alexa-lf-40': {
    label: 'ARRI ALEXA LF · Signature Prime 40 mm',
    sensorWidthMm: 36.7, sensorHeightMm: 25.54, focalMm: 40, shutterAngleDeg: 180, iso: 800, tStop: 1.8, squeeze: 1,
    note: 'large format, the wider look with the same framing',
  },
  'venice2-24': {
    label: 'Sony VENICE 2 · 24 mm',
    sensorWidthMm: 35.9, sensorHeightMm: 24, focalMm: 24, shutterAngleDeg: 172.8, iso: 800, tStop: 2.8, squeeze: 1,
    note: '8.6K full frame, 172.8° kills 50 Hz flicker',
  },
  'raptor-50': {
    label: 'RED V-RAPTOR 8K VV · 50 mm',
    sensorWidthMm: 40.96, sensorHeightMm: 21.6, focalMm: 50, shutterAngleDeg: 180, iso: 800, tStop: 2, squeeze: 1,
    note: '8K vista vision, 17:9, the long end of a two-lens kit',
  },
  'anamorphic-2x-40': {
    label: 'ALEXA Mini LF · Cooke Anamorphic 40 mm, 2x',
    sensorWidthMm: 31.68, sensorHeightMm: 18, focalMm: 40, shutterAngleDeg: 180, iso: 800, tStop: 2.3, squeeze: 2,
    note: 'the squeeze doubles the horizontal field the sensor sees',
  },
  'imax65-50': {
    label: 'IMAX MSM 9802 · 50 mm',
    sensorWidthMm: 70.41, sensorHeightMm: 52.63, focalMm: 50, shutterAngleDeg: 180, iso: 500, tStop: 2.8, squeeze: 1,
    note: '15/70 film, the widest gate in this list',
  },
} as const satisfies Record<string, CineCamera>

export type CineCameraKey = keyof typeof CINE_CAMERAS

export function isCineCameraKey(value: string): value is CineCameraKey {
  return Object.hasOwn(CINE_CAMERAS, value)
}

export function horizontalFovDeg(camera: CineCamera, focalMm = camera.focalMm): number {
  return (2 * Math.atan((camera.sensorWidthMm * camera.squeeze) / (2 * focalMm)) * 180) / Math.PI
}

export function relativeStops(camera: CineCamera): number {
  return (
    Math.log2(camera.iso / REFERENCE_EXPOSURE.iso) -
    2 * Math.log2(camera.tStop / REFERENCE_EXPOSURE.tStop) +
    Math.log2(camera.shutterAngleDeg / REFERENCE_EXPOSURE.shutterAngleDeg)
  )
}

export function applyCineCamera(camera: PerspectiveCamera, cine: CineCamera, focalMm: number): void {
  camera.filmGauge = cine.sensorWidthMm * cine.squeeze
  camera.setFocalLength(focalMm)
  camera.updateProjectionMatrix()
}
