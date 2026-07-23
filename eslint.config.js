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
  },
  {
    // Preview manifests are discovered at runtime with import.meta.glob(), so
    // each module must export metadata as well as its React preview component.
    files: ['src/features/ui-kit/**/preview.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
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
