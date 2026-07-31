import type { ComponentType } from 'react'

/**
 * A DEV lab's registration manifest — see the `dev-lab-authoring` skill, rule 3.
 *
 * This is the ONLY thing a lab is allowed to export. It carries strings and a
 * loader; it must never re-export the lab's components, systems or fixtures,
 * because that is how a DEV-only surface ends up in the shipped bundle.
 *
 * A lab declares one of these in a `*.lab.ts` file beside its screen. The
 * registry finds it on its own and the router builds the route from it, so a new
 * lab is never a router edit.
 *
 * The contract lives in `shared/` rather than beside the registry because a
 * feature may not import the app layer: the direction is app → scenes →
 * features → shared, and a manifest sits in its feature.
 */
export interface DevLab {
  /** Sorted into groups in the index. */
  readonly category: DevLabCategory
  /**
   * What this lab lets you SEE, in one line — "mount and align a weapon on the
   * rig, then test-fire it", not "the weapon lab scene". This is the caption
   * under the card, and it is what makes the index usable.
   */
  readonly description: string
  /** Kebab-case, unique. Doubles as the route segment and the preview filename. */
  readonly id: string
  /** Lazily pulls the lab's screen in — nothing of the lab loads until it opens. */
  readonly load: () => Promise<{ readonly default: ComponentType }>
  /**
   * A real captured frame from this lab (imported image URL). Omitted until one
   * has been captured, which the index shows as an explicitly empty card —
   * never as decoration. Capture with `npm run labs:previews`.
   */
  readonly preview?: string
  readonly title: string
}

export type DevLabCategory =
  | 'ai'
  | 'character'
  | 'combat'
  | 'gear'
  | 'meta'
  | 'render'
  | 'world'

/** The shape of a `*.lab.ts` module. */
export interface DevLabModule {
  readonly devLab: DevLab
}
