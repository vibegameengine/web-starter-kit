import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'character',
  description:
    'Step the walk one simulated frame at a time and read what each frame did: which clip, the cycle phase, contact weight and lock per foot, the stride scale, pelvis drop and the world height of both feet.',
  id: 'motion-stand',
  load: async () => ({ default: (await import('./MotionStandScreen')).MotionStandScreen }),
  title: 'Motion stand',
}
