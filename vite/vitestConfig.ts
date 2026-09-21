import type { InlineConfig } from 'vitest/node'

/**
 * How the unit suite runs — the `test` half of `vite.config.ts`.
 *
 * Extracted because it has a name of its own and nothing to do with building
 * the app: the two lived in one exported factory that was the longest function
 * in the repository, well over the hard limit the clean-code guard holds, and
 * every future line spent in there had to be paid for by something.
 */
export const vitestConfig: InlineConfig = {
  coverage: {
    excludeAfterRemap: true,
    provider: 'v8',
    reporter: ['text', 'html'],
    thresholds: {
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    // The coverage bar is held on pure, framework-free logic. UI, the entry,
    // demo, type-only modules and the browser/virtual-module bridges are
    // exercised by the build and Playwright instead of unit coverage.
    // (scripts/bump-version.ts still has its own passing unit test; it is just
    // not part of the measured aggregate because of its untested CLI entry.)
    include: [
      'src/features/bootstrap/systems/**/*.ts',
      'src/shared/lib/motion.ts',
    ],
    exclude: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/features/bootstrap/systems/bootstrapSteps.ts',
      'src/features/bootstrap/systems/bootstrapAssetRegistry.ts',
      'src/features/bootstrap/systems/preloadBootstrapAssets.ts',
    ],
  },
  environment: 'jsdom',
  exclude: [
    'e2e/**',
    'node_modules/**',
  ],
  globals: true,
}
