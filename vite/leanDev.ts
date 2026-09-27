import { devLeanTransportPlugin } from './devLeanTransportPlugin'

/**
 * The lean dev server — `npm run dev:lean`. See `docs/lean-dev-server.md`.
 *
 * Here rather than inline in `vite.config.ts` because the config's exported
 * factory is already the longest function in the repository, and three more
 * branches inside it push it past the limit the clean-code guard holds it to.
 */
export const leanDev = {
  /** Strip inline sourcemaps and compress responses. */
  enabled: process.env.VITE_DEV_LEAN === 'true',
  /**
   * Vite 8's `experimental.bundledDev`: a cold open becomes a handful of
   * requests instead of hundreds, and per-module HMR goes away entirely.
   * Opt-in — `npm run dev:lean -- --bundle`.
   */
  bundled: process.env.VITE_DEV_BUNDLE === 'true',
}

/**
 * Do the DEV labs, the UI-kit gallery and the demo world ship?
 *
 * Every dev server serves them, the lean one included: a lean link is how the
 * work is shown to somebody who is not at this machine, and the labs are the work.
 */
export function showcaseSurfaces(command: string): boolean {
  return command === 'serve' || process.env.VITE_ENABLE_SHOWCASE === 'true'
}

/**
 * Wraps every dev response: sourcemaps off, brotli/gzip on. Inert unless lean.
 *
 * Goes FIRST in the plugin list — it intercepts the response, so everything
 * after it, Vite's own middlewares included, writes through this one.
 */
export function leanDevTransport() {
  return devLeanTransportPlugin({ compress: leanDev.enabled, stripSourcemaps: leanDev.enabled })
}

/**
 * Config fragments the lean server contributes, ready to spread.
 *
 * A spread rather than three lines written out at the call site: the config's
 * exported factory is the longest function in this repository and the guard
 * holds it to what it already was, so every line spent there has to earn it.
 */
export const leanDevConfig = {
  experimental: { bundledDev: leanDev.bundled },
}
