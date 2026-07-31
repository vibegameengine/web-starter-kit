import type { DevLabCategory } from '../../shared/lib/devLab'

/**
 * Display order and labels for the index's groups.
 *
 * The manifest CONTRACT lives in `shared/lib/devLab.ts` (a feature may not
 * import the app layer); only how the index presents the groups belongs here.
 */
export const DEV_LAB_CATEGORIES: readonly { readonly id: DevLabCategory; readonly title: string }[] = [
  { id: 'character', title: 'Character & rig' },
  { id: 'combat', title: 'Combat' },
  { id: 'ai', title: 'AI & navigation' },
  { id: 'gear', title: 'Gear & survival' },
  { id: 'world', title: 'World' },
  { id: 'render', title: 'Rendering & VFX' },
  { id: 'meta', title: 'Meta loop' },
]
