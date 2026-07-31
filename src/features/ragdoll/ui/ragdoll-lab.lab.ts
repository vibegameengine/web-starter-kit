import type { DevLab } from '../../../shared/lib/devLab'

export const devLab: DevLab = {
  category: 'character',
  description:
    'Drop a rigged body on any surface, then grab it, fling it, spin it and throw solid shapes at it.',
  id: 'ragdoll-lab',
  load: async () => ({ default: (await import('./RagdollLabScreen')).RagdollLabScreen }),
  title: "Ragdoll lab",
}
