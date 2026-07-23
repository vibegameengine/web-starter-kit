import { describe, expect, it } from 'vitest'

import { atlasLayout } from './atlasLayout'

describe('atlasLayout', () => {
  it('packs into a square-ish grid (cols = ceil(sqrt(count)))', () => {
    const l = atlasLayout(27, 512, 8)
    expect(l.cols).toBe(6) // ceil(sqrt(27)) = 6
    expect(l.rows).toBe(5) // ceil(27/6) = 5
    expect(l.width).toBe(6 * 512)
    expect(l.height).toBe(5 * 512)
  })

  it('handles the 1-part edge (still a valid 1x1 grid)', () => {
    const l = atlasLayout(1, 256, 4)
    expect(l.cols).toBe(1)
    expect(l.rows).toBe(1)
    expect(l.width).toBe(256)
  })

  it('cellPx returns the inset inner rect at the right cell', () => {
    const l = atlasLayout(4, 100, 10) // 2x2 grid, inner = 80
    expect(l.cellPx(0)).toEqual({ x: 10, y: 10, w: 80, h: 80 })
    expect(l.cellPx(1)).toEqual({ x: 110, y: 10, w: 80, h: 80 }) // col 1
    expect(l.cellPx(2)).toEqual({ x: 10, y: 110, w: 80, h: 80 }) // row 1
  })

  it('cellUv maps [0,1] into the cell inner rect (matches cellPx / atlas size)', () => {
    const l = atlasLayout(4, 100, 10) // width=height=200, inner=80
    const uv = l.cellUv(1) // col 1, row 0
    expect(uv.ox).toBeCloseTo(110 / 200) // (col*cell + gutter)/width
    expect(uv.oy).toBeCloseTo(10 / 200)
    expect(uv.sx).toBeCloseTo(80 / 200) // inner/width
    expect(uv.sy).toBeCloseTo(80 / 200)
    // a source UV of (1,1) lands at the cell's far inner corner
    expect(uv.ox + 1 * uv.sx).toBeCloseTo(190 / 200)
  })
})
