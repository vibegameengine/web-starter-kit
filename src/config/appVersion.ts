/**
 * Single source of truth for the app version. `__APP_VERSION__` is injected by
 * `define` in vite.config.ts from `package.json -> version`, so bumping the
 * version (via `npm run version:patch|minor|major`) updates the build,
 * tooling, and anything that renders it — no duplicate constant to keep in sync.
 */
export const APP_VERSION: string = __APP_VERSION__
