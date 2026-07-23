import { describe, expect, it } from 'vitest'

import { isNavigationPointWalkable, type NavigationSurfaceDescriptor } from './navigationSurface'

const surface: NavigationSurfaceDescriptor = {
  id: 'test',
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  cellSize: 1,
  elevation: 0,
  blockers: [
    { id: 'fountain', kind: 'circle', center: [0, 0], radius: 2 },
    { id: 'house', kind: 'orientedRect', center: [-5, -4], halfSize: [2, 1.5], rotation: Math.PI / 4 },
    { id: 'river', kind: 'corridor', points: [[4, -10], [5, 0], [4, 10]], halfWidth: 1.5 },
  ],
}

describe('navigation surface', () => {
  it('rejects points outside bounds and inside every blocker family', () => {
    expect(isNavigationPointWalkable(surface, [11, 0])).toBe(false)
    expect(isNavigationPointWalkable(surface, [0, 0])).toBe(false)
    expect(isNavigationPointWalkable(surface, [-5, -4])).toBe(false)
    expect(isNavigationPointWalkable(surface, [5, 0])).toBe(false)
  })

  it('keeps deliberate open routes walkable', () => {
    expect(isNavigationPointWalkable(surface, [-1, 5])).toBe(true)
    expect(isNavigationPointWalkable(surface, [0, -8])).toBe(true)
  })
})
