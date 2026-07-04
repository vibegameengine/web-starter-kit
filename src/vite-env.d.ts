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
