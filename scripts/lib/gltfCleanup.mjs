import { dedup, prune } from '@gltf-transform/functions'

/**
 * The cleanup every model in this project gets, in ONE place.
 *
 * `flatten()` is deliberately absent and `prune` keeps leaf nodes, because
 * together those two quietly delete the parts of a model that carry meaning:
 * `flatten()` reparents what it can to the scene root, severing a socket from
 * the part it was attached to, and `prune()` then removes any node left with no
 * mesh and no children — which is exactly what a socket IS.
 *
 * Measured across this project's models, the old pair had been deleting the
 * shotgun's `muzzle`, the player's `PM_FPSRig`, and five Mixamo end bones from
 * Tany. What it saved was node COUNT, which is not what these files are big
 * with: keeping them costs at most 572 bytes, 0.079%, on the worst offender.
 *
 * This module exists because the same three lines had been written independently
 * in six places and got wrong in four of them. A `.mjs` module is importable by
 * both the build scripts and the TypeScript Vite plugins; a `.ts` one is not.
 */
export const cleanupTransforms = () => [dedup(), prune({ keepLeaves: true })]
