import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'character',
  description: 'Hold the production character in its bind, idle and Mixamo action states side by side.',
  id: 'character-debug-lab',
  load: async () => ({ default: (await import('./CharacterDebugScreen')).CharacterDebugScreen }),
  title: 'Character debug',
}
