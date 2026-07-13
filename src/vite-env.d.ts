/// <reference types="vite/client" />

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
