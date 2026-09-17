import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'character',
  description:
    'Drive a body over stairs, ledges, a wall and a gap to see what the motion controller does with each: what it climbs, what it refuses, where it slides and where it sticks.',
  id: 'motion-lab',
  load: async () => ({ default: (await import('./MotionLabScreen')).MotionLabScreen }),
  title: 'Motion lab',
}
