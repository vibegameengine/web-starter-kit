/// <reference types="vite/client" />

declare module 'virtual:bootstrap-assets' {
  export type BootstrapAssetEntry = {
    deferred: boolean
    id: string
    kind: 'audio' | 'font' | 'image' | 'other'
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

declare module '*.glb?url' {
  const url: string
  export default url
}

// Injected by `define` in vite.config.ts from package.json -> version.
declare const __APP_VERSION__: string

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
