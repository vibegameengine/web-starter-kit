import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'render',
  description: 'Ground, a pressed mud road and a parallaxed stone overlay on ONE mesh — switch each layer to its raw mask and move the stone coverage to see where the stack joins.',
  id: 'layered-terrain',
  load: async () => ({ default: (await import('./LayeredTerrainLabScreen')).LayeredTerrainLabScreen }),
  title: 'Layered terrain',
}
