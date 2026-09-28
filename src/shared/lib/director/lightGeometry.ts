import { Color } from 'three'

export type Vector3Tuple = [number, number, number]

export type LightAngles = {
  readonly azimuthDeg: number
  readonly distance: number
  readonly elevationDeg: number
}

const DEGREES = 180 / Math.PI

export function anglesFromOffset([x, y, z]: Vector3Tuple): LightAngles {
  const distance = Math.hypot(x, y, z)
  return {
    azimuthDeg: Math.atan2(x, z) * DEGREES,
    distance,
    elevationDeg: Math.asin(y / distance) * DEGREES,
  }
}

export function offsetFromAngles({ azimuthDeg, distance, elevationDeg }: LightAngles): Vector3Tuple {
  const azimuth = azimuthDeg / DEGREES
  const elevation = elevationDeg / DEGREES
  const horizontal = distance * Math.cos(elevation)
  return [horizontal * Math.sin(azimuth), distance * Math.sin(elevation), horizontal * Math.cos(azimuth)]
}

export function stopsToGain(stops: number): number {
  return 2 ** stops
}

export function withChroma(hex: string, chroma: number): string {
  const colour = new Color(hex)
  const grey = colour.r * 0.2126 + colour.g * 0.7152 + colour.b * 0.0722
  const amount = Math.min(1, Math.max(0, chroma))
  const mixed = colour.setRGB(
    grey + (colour.r - grey) * amount,
    grey + (colour.g - grey) * amount,
    grey + (colour.b - grey) * amount,
  )
  return `#${mixed.getHexString()}`
}
