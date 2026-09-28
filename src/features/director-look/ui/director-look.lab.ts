import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'render',
  description: 'The director panel on a sunlit look-dev set: 18% grey ball, chrome ball and a ColorChecker in the sun, a wall whose shadow a moving ball keeps entering. Drag exposure, look, sun and ambient and watch every one land.',
  id: 'director-look',
  load: async () => ({ default: (await import('./DirectorLookLabScreen')).DirectorLookLabScreen }),
  title: 'Director look',
}
