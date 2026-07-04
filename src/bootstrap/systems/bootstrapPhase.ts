export type BootstrapPhase =
  | 'prepare'
  | 'assets'
  | 'finalize'
  | 'render'
  | 'ready'
  | 'failed'

/**
 * The app subtree is mounted (hidden under the overlay) starting at `render`,
 * so it can paint its first real frame before the overlay is dismissed. It
 * stays mounted at `ready`.
 */
export function shouldMountAppForBootstrapPhase(phase: BootstrapPhase): boolean {
  return phase === 'render' || phase === 'ready'
}
