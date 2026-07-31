/**
 * What the HUD can do to the body.
 *
 * The controls live in the DOM and the physics lives in the canvas, so the two
 * meet through a ref the in-canvas components fill on mount — the same shape the
 * ragdoll itself already uses for `RagdollApi`. Every field is optional because
 * the object is filled by SEVERAL owners: the handling component contributes the
 * verbs that act on the body, the thrower contributes its own, and the panel
 * must not care which of them has mounted yet.
 */
export type RagdollLabActions = {
  /** Fling the whole body away from the camera. */
  readonly launch?: () => void
  /** Spin the body about the vertical axis. `sign` picks the direction. */
  readonly spin?: (sign: number) => void
  /** Throw the selected shape at the cursor. */
  readonly throwShape?: () => void
  /** Tumble the body head over heels, about the camera's right axis. */
  readonly tumble?: (sign: number) => void
}
