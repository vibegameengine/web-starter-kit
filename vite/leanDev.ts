import { devLeanTransportPlugin } from './devLeanTransportPlugin'

/**
 * The lean dev server — `npm run dev:lean`. See `docs/lean-dev-server.md`.
 *
 * Here rather than inline in `vite.config.ts` because the config's exported
 * factory is already the longest function in the repository, and three more
 * branches inside it push it past the limit the clean-code guard holds it to.
 */
export const leanDev = {
  /** Strip inline sourcemaps, compress responses, drop the showcase surfaces. */
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
 * Lean mode drops them from the DEV SERVER too, through the same literal the
 * production build uses — so they stop being fetched rather than merely being
 * unreachable.
 */
export function showcaseSurfaces(command: string): boolean {
  return (command === 'serve' && !leanDev.enabled) || process.env.VITE_ENABLE_SHOWCASE === 'true'
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
