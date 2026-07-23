export type GraphicsQuality = 'performance' | 'economy'
export type FrameRateCap = 0 | 30 | 45 | 60

export type GraphicsPreset = {
  readonly dpr: number
  readonly shadowMapSize: number
  readonly shadowRadius: number
  readonly shadowThrottle: number
}

export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = 'performance'
export const DEFAULT_FRAME_RATE_CAP: FrameRateCap = 0
export const FRAME_RATE_CAPS: readonly FrameRateCap[] = [0, 60, 45, 30]
export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  performance: { dpr: 1, shadowMapSize: 2048, shadowRadius: 3.25, shadowThrottle: 2 },
  economy: { dpr: 0.75, shadowMapSize: 1024, shadowRadius: 2.5, shadowThrottle: 3 },
}
