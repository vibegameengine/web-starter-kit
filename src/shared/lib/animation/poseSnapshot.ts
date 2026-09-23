import type { Object3D, Quaternion, Vector3 } from 'three'

type Held = { readonly node: Object3D; readonly position: Vector3; readonly quaternion: Quaternion }

export type PoseSnapshot = {
  readonly capture: () => void
  readonly restore: () => void
}

/* @important Taken right after the mixer updates and put back right before the
   next update, this is what makes every frame start from the mixer's own pose.
   The mixer skips writing a bone whose value has not changed (see the test), so
   without it everything applied after the mixer compounds on a held frame. */
export function createPoseSnapshot(root: Object3D): PoseSnapshot {
  const held: Held[] = []
  root.traverse((node) => {
    if (!(node as { isBone?: boolean }).isBone) return
    held.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone() })
  })
  return {
    capture: () => {
      for (const entry of held) {
        entry.position.copy(entry.node.position)
        entry.quaternion.copy(entry.node.quaternion)
      }
    },
    restore: () => {
      for (const entry of held) {
        entry.node.position.copy(entry.position)
        entry.node.quaternion.copy(entry.quaternion)
      }
    },
  }
}
