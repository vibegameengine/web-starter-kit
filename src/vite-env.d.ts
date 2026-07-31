/// <reference types="vite/client" />

/**
 * Baked in by the Vite config from `VITE_ENABLE_SHOWCASE`: does this build ship
 * the DEV lab index and the UI-kit gallery? A literal, so Rollup can fold it and
 * drop everything behind it. Read it through `shared/lib/showcase.ts`.
 */
declare const __SHOWCASE_SURFACES__: boolean

interface ImportMetaEnv {
  /**
   * `'true'` keeps the INSPECTION surfaces — the DEV lab index and the UI-kit
   * gallery — in a PRODUCTION build. Opt-in, for a showcase deployment where
   * those surfaces are the point (this kit's own Pages site). A shipping game
   * leaves it unset, and both surfaces — routes, screens, preview images and
   * every asset they reach — are tree-shaken out. See `shared/lib/showcase.ts`.
   */
  readonly VITE_ENABLE_SHOWCASE?: string
}

declare module 'virtual:bootstrap-assets' {
  export type BootstrapAssetEntry = {
    deferred: boolean
    id: string
    kind: 'audio' | 'font' | 'image' | 'model' | 'other'
    size: number
    source: string
    url: string
  }

  export const bootstrapAssetEntries: BootstrapAssetEntry[]
}

declare module '*.mp3?audio-optimize=off' {
  const url: string
  export default url
}

declare module '*.fbx' {
  const url: string
  export default url
}

declare module '*.fbx?fbx=raw' {
  const url: string
  export default url
}

// `.glb` / `.gltf` imports resolve to the optimized asset URL (built by
// `glbAssetOptimizerPlugin`). Per-import option forms (`?texture=…`,
// `?texture-format=…`, `?glb-optimize=off`, …) are declared explicitly as they
// are used, matching how audio opt-out is declared above.
declare module '*.glb' {
  const url: string
  export default url
}

declare module '*.gltf' {
  const url: string
  export default url
}

declare module '*.glb?url' {
  const url: string
  export default url
}

declare module '*.glb?glb-optimize=off' {
  const url: string
  export default url
}

declare module '*.glb?texture=1024' {
  const url: string
  export default url
}

declare module '*.glb?texture=1024&albedo' {
  const url: string
  export default url
}

declare module '*.glb?texture=1024&albedo&meshopt' {
  const url: string
  export default url
}

// three's WebGPU renderer + TSL node system ship no bundled .d.ts on these
// subpaths, so declare the symbols we use as `any` (the node graph is dynamic).
declare module 'three/webgpu' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const WebGPURenderer: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const RenderPipeline: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const PostProcessing: any
}

declare module 'three/tsl' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export const pass: any
  export const mrt: any
  export const output: any
  export const normalView: any
  export const diffuseColor: any
  export const velocity: any
  export const add: any
  export const vec3: any
  export const vec4: any
  export const packNormalToRGB: any
  export const unpackRGBToNormal: any
  export const sample: any
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

declare module 'three/addons/tsl/display/SSGINode.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ssgi: any
}

declare module 'three/addons/tsl/display/TRAANode.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const traa: any
}

declare module 'three/addons/tsl/display/DenoiseNode.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const denoise: any
}

declare module 'three/addons/tsl/display/RecurrentDenoiseNode.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const recurrentDenoise: any
}
