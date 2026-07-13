import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import fs from 'node:fs'
import { imagetools } from 'vite-imagetools'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import { defineConfig } from 'vitest/config'
import {
  audioAssetOptimizerPlugin,
  bootstrapAssetRegistryPlugin,
  fbxAssetLoaderPlugin,
  glbAssetOptimizerPlugin,
  imagetoolsDevCachePlugin,
} from './vite'

// Load GLSL shader files as default-exported strings — the vendored realism-
// effects TRAA in src/shared/vendor/realism-effects imports .glsl/.frag/.vert this way.
// Strips a leading BOM (some vendored shaders carry one, which breaks GLSL).
const shaderRawLoader = () => ({
  name: 'shader-raw-loader',
  enforce: 'pre' as const,
  load(id: string) {
    const file = id.split('?')[0]
    if (!/\.(glsl|frag|vert|vs|fs)$/.test(file)) {
      return null
    }
    let source = fs.readFileSync(file, 'utf8')
    if (source.charCodeAt(0) === 0xfeff) {
      source = source.slice(1)
    }
    return `export default ${JSON.stringify(source)}`
  },
})

// https://vite.dev/config/
export default defineConfig({
  // Static hosts use the portable relative default. GitHub project Pages needs
  // its repository sub-path so BrowserRouter and emitted assets agree.
  base: process.env.VITE_BASE_PATH ?? './',
  plugins: [
    shaderRawLoader(),
    // Walks the static import graph from the entry and exposes every reachable
    // asset through `virtual:bootstrap-assets` so the preloader needs no manifest.
    bootstrapAssetRegistryPlugin({
      entry: '/src/main.tsx',
    }),
    // Re-encodes `src/**/assets/audio/*.mp3` at build time (mono/stereo + bitrate
    // by duration) with clip-safe normalization. Opt out per import via
    // `?audio-optimize=off`.
    audioAssetOptimizerPlugin(),
    // Repacks `src/**/*.glb|.gltf` at build time: cleans the document and shrinks
    // embedded textures (resize to 2048 + WebP). Tune per import via
    // `?texture=1024` / `?texture-format=keep` / `?texture-quality=90`, or bypass
    // with `?glb-optimize=off`.
    glbAssetOptimizerPlugin(),
    fbxAssetLoaderPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Serves imagetools output from disk cache in dev so repeated transforms are cheap.
    imagetoolsDevCachePlugin(),
    imagetools(),
    ViteImageOptimizer({
      includePublic: false,
      logStats: true,
      png: { quality: 82 },
      jpeg: { quality: 82 },
      jpg: { quality: 82 },
      webp: { quality: 82 },
      avif: { quality: 60 },
    }),
  ],
  test: {
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
  },
})
