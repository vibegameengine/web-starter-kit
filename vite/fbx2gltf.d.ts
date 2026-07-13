// `fbx2gltf` ships a prebuilt FBX2glTF binary with no bundled types. The default
// export converts an FBX file to glTF/GLB and resolves with the output path.
declare module 'fbx2gltf' {
  const convert: (input: string, output: string, options?: readonly string[]) => Promise<string>
  export default convert
}
