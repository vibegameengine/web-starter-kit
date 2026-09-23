import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'character',
  description:
    'Play a library clip on its own UE5 skeleton beside the same clip retargeted onto the Mixamo mannequin, frame by frame, with the worst limb disagreement between the two read out live.',
  id: 'motion-retarget',
  load: async () => ({ default: (await import('./MotionRetargetScreen')).MotionRetargetScreen }),
  title: 'Retarget',
}
