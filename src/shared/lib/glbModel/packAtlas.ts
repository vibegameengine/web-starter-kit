import type { AtlasLayout, AtlasSource } from './types'

/**
 * Paint one channel's per-part sources into a single canvas atlas, one source per
 * cell of `layout`. Channel-agnostic: today it packs base-color maps; the same
 * function packs normal maps once that channel is implemented. A source with no
 * `image` is filled with its solid `color` (a part whose texture was folded to a
 * `baseColorFactor`). Returns `null` if a 2D context can't be obtained.
 */
export function packAtlas(sources: readonly AtlasSource[], layout: AtlasLayout): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  sources.forEach((source, i) => {
    const { x, y, w, h } = layout.cellPx(i)
    if (source.image) {
      ctx.drawImage(source.image, x, y, w, h)
    } else {
      ctx.fillStyle = `#${source.color ? source.color.getHexString() : 'ffffff'}`
      ctx.fillRect(x, y, w, h)
    }
  })

  return canvas
}
