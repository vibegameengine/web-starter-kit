import type { AtlasLayout } from './types'

/**
 * Pure square-ish grid layout for packing `count` parts into one texture atlas.
 * `cols = ceil(sqrt(count))`; each cell is `cell` px with a `gutter` inset on all
 * sides (the gutter stops neighbouring cells from bleeding into each other at lower
 * mip levels). No canvas / three — trivially unit-testable.
 */
export function atlasLayout(count: number, cell: number, gutter: number): AtlasLayout {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))
  const width = cols * cell
  const height = rows * cell
  const inner = cell - 2 * gutter

  return {
    cols,
    rows,
    cell,
    gutter,
    width,
    height,
    cellPx(index) {
      const col = index % cols
      const row = Math.floor(index / cols)
      return { x: col * cell + gutter, y: row * cell + gutter, w: inner, h: inner }
    },
    cellUv(index) {
      const col = index % cols
      const row = Math.floor(index / cols)
      return {
        ox: (col * cell + gutter) / width,
        oy: (row * cell + gutter) / height,
        sx: inner / width,
        sy: inner / height,
      }
    },
  }
}
