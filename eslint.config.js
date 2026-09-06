import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['coverage', 'dist', 'src/shared/vendor/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // A `useState` re-renders its whole subtree, so a value held in one costs
      // the frame budget of everything BELOW it rather than of the things that
      // read it. Publishing a simulation tick into state held above its
      // consumers is how this is usually discovered: the sky, the lights and the
      // physics provider all re-render, and not one of them reads a tick.
      //
      // Keep per-frame and per-input values in a ref, a store, or a mutable
      // object read from useFrame. React state is still the right answer when a
      // render genuinely has to happen — say so on the line:
      //   // eslint-disable-next-line no-restricted-syntax -- <reason>
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="useState"]',
          message:
            'useState re-renders its whole subtree, not just its readers. Keep per-frame and per-input values in a ref or a store, or disable this rule on the line with a reason.',
        },
        {
          selector:
            'CallExpression[callee.object.name="React"][callee.property.name="useState"]',
          message:
            'useState re-renders its whole subtree, not just its readers. Keep per-frame and per-input values in a ref or a store, or disable this rule on the line with a reason.',
        },
      ],
    },
  },
  {
    // Preview manifests are discovered at runtime with import.meta.glob(), so
    // each module must export metadata as well as its React preview component.
    files: ['src/features/ui-kit/**/preview.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
      // A preview exists to be clicked: its state IS the thing on display, and
      // the subtree it re-renders is one component on a gallery page with no
      // frame budget to protect. The ban stays on everywhere a preview's
      // component actually ships.
      'no-restricted-syntax': 'off',
    },
  },
  {
    // These components intentionally mutate Three.js renderer and buffer
    // objects from R3F lifecycle callbacks; React state is not involved.
    files: [
      'src/features/world/entities/Fountain.tsx',
      'src/features/world/entities/Water.tsx',
      'src/scenes/demo-scene/StarterScene.tsx',
      'src/shared/lib/ShadowThrottle.tsx',
    ],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
])
