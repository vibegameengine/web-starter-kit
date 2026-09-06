import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'render',
  description: 'One continuous 44 m ground under scale markers — orbit to the far corner and hunt for a repeat. Four world-space tools fight it; on this low-contrast gravel the domain warp does most of the work.',
  id: 'anti-tiling-ground',
  load: async () => ({ default: (await import('./AntiTilingGroundLabScreen')).AntiTilingGroundLabScreen }),
  title: 'Anti-tiling ground',
}
