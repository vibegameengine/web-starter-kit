export type GraphicsQuality = 'performance' | 'economy'
/**
 * The FPS ceiling the renderer paces itself to. `0` is unlimited.
 *
 * 120 was missing, and its absence is the reason the frame-time graph was a saw
 * rather than a thread. Measured over three whole waves: the distribution is not
 * quantized to the display at all — a smooth unimodal blob from 3.5 ms to 13 ms,
 * with 1% of frames at 3.5 ms, which is impossible under a 120 Hz lock, and
 * slow-frame pairs summing to 2.5 refresh intervals rather than a whole number.
 * The renderer was FREE-RUNNING, so its output carried 1.6-2.7 ms of standard
 * deviation regardless of how cheap the frame got. A mean of 8.36 ms is 119.6 fps
 * and looks finished in a summary; unpaced, it still draws a saw.
 *
 * `0` was the default, i.e. "as fast as it can", which is the setting that
 * guarantees the jitter. The cap is the pacing.
 */
export type FrameRateCap = 0 | 30 | 45 | 60 | 120

export type GraphicsPreset = {
  readonly dpr: number
  readonly shadowMapSize: number
  readonly shadowRadius: number
  readonly shadowThrottle: number
}

export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = 'performance'
/**
 * Left at `0`, and this is a MEASURED decision that came out the opposite way
 * from the obvious one. Do not "fix" it back to 120 without re-running the numbers.
 *
 * The reasoning for capping at 120 was sound: the frame-time distribution is not
 * quantized to the display, so the renderer is free-running and carries its own
 * jitter. Setting `DEFAULT_FRAME_RATE_CAP = 120` and re-measuring three whole
 * waves made every part of it WORSE:
 *
 *                     unlimited (0)      capped at 120
 *   W3 mean               8.38 ms           8.45 ms
 *   W3 sd                 1.62              2.26
 *   W3 p99/mean           1.539             1.644
 *   near a refresh multiple  64.0%          43.8%
 *   frames under 7 ms        10.2%          19.5%
 *
 * Less aligned to the refresh, not more, and nearly twice as many very short
 * frames. `maxFps` in the vendored r3f fork throttles the render LOOP; it is not
 * a presentation pacer, and on a display whose refresh already matches the cap it
 * fights vsync instead of riding it — it skips a rAF, then the next frame arrives
 * early. With no headroom (mean 8.38 against a 8.333 budget) that trade is pure
 * loss.
 *
 * The cap becomes worth revisiting once the frame is genuinely cheaper than the
 * budget. It is not a substitute for making it cheaper.
 */
export const DEFAULT_FRAME_RATE_CAP: FrameRateCap = 0
export const FRAME_RATE_CAPS: readonly FrameRateCap[] = [0, 120, 60, 45, 30]
export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  performance: { dpr: 1, shadowMapSize: 2048, shadowRadius: 3.25, shadowThrottle: 2 },
  economy: { dpr: 0.75, shadowMapSize: 1024, shadowRadius: 2.5, shadowThrottle: 3 },
}
