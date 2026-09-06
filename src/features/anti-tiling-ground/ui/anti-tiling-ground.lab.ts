import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'render',
  description: 'One continuous 44 m ground under scale markers — orbit out to the far corner and look for the repeat that world-space anti-tiling removes.',
  id: 'anti-tiling-ground',
  load: async () => ({ default: (await import('./AntiTilingGroundLabScreen')).AntiTilingGroundLabScreen }),
  title: 'Anti-tiling ground',
}
