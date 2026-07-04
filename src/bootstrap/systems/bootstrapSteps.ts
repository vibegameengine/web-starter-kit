/**
 * An optional async stage in the bootstrap pipeline. Prepare steps run before
 * asset preload (e.g. init a platform SDK, resolve a locale, load fonts);
 * finalize steps run after (e.g. hydrate a saved profile). A step should honor
 * `signal.aborted` for long work so retries and unmounts cancel cleanly.
 */
export type BootstrapStep = {
  readonly id: string
  run(signal: AbortSignal): Promise<void>
}
