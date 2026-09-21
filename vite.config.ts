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
// The lean dev server — `npm run dev:lean`; see `docs/lean-dev-server.md`.
import { leanDevConfig, leanDevTransport, showcaseSurfaces } from './vite/leanDev'
import { vitestConfig } from './vite/vitestConfig'

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
export default defineConfig(({ command }) => ({
  // Static hosts use the portable relative default. GitHub project Pages needs
  // its repository sub-path so BrowserRouter and emitted assets agree.
  base: process.env.VITE_BASE_PATH ?? './',
  // Whether this build ships the inspection surfaces (DEV labs, UI-kit gallery).
  //
  // Injected as a LITERAL rather than read from `import.meta.env` in the module
  // that needs it, because that is what makes it disappear: Rollup folds a
  // literal across module boundaries and drops the dynamic imports behind it,
  // while a `const` initialised from an env expression stays opaque and the
  // whole surface ships anyway — measured, not assumed (7.9 MB against 3.4 MB).
  define: {
    __SHOWCASE_SURFACES__: JSON.stringify(showcaseSurfaces(command)),
  },
  // Keep ecosystem peer dependencies on upstream R3F, but resolve every runtime
  // import to the maintained Vibegameengine fork. This provides its native FPS
  // cap without introducing a second R3F context beside drei/postprocessing.
  resolve: {
    alias: {
      '@react-three/fiber': '@vibegameengine/react-three-fiber',
      // Photon only uses the native browser WebSocket here; this avoids bundling
      // its Node-only `ws` fallback.
      ws: new URL('./vite/ws-browser-stub.js', import.meta.url).pathname,
    },
    dedupe: ['three', 'react', 'react-dom', '@vibegameengine/react-three-fiber'],
  },
  optimizeDeps: {
    include: ['@vibegameengine/react-three-fiber'],
  },
  ...leanDevConfig,
  plugins: [
    leanDevTransport(),
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
  test: vitestConfig,
}))
