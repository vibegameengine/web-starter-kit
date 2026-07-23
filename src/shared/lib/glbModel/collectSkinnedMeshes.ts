import type { Object3D, SkinnedMesh } from 'three'

/** Collect every SkinnedMesh leaf under a (cloned) character scene. */
export function collectSkinnedMeshes(root: Object3D): SkinnedMesh[] {
  const out: SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh)
  })
  return out
}
