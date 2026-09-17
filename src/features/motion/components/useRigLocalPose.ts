import { useMemo } from 'react'
import { Euler, Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

import type { LocalPose } from '../systems/motionMatchQuery'

const BONES = { hips: /Hips$/, left: /LeftFoot$/, right: /RightFoot$/ }

export type RigLocalPoseReader = () => LocalPose | null

export function useRigLocalPose(rig: Object3D): RigLocalPoseReader {
  const bones = useMemo(() => {
    const found: Record<keyof typeof BONES, Object3D | null> = { hips: null, left: null, right: null }
    rig.traverse((node) => {
      for (const key of Object.keys(BONES) as readonly (keyof typeof BONES)[]) {
        if (!found[key] && BONES[key].test(node.name)) found[key] = node
      }
    })
    return found
  }, [rig])

  const scratch = useMemo(() => ({
    euler: new Euler(),
    hips: new Vector3(),
    left: new Vector3(),
    right: new Vector3(),
    rotation: new Quaternion(),
  }), [])

  return () => {
    const { hips, left, right } = bones
    if (!hips || !left || !right) return null

    hips.getWorldPosition(scratch.hips)
    left.getWorldPosition(scratch.left)
    right.getWorldPosition(scratch.right)
    hips.getWorldQuaternion(scratch.rotation)
    scratch.euler.setFromQuaternion(scratch.rotation, 'YXZ')

    const cos = Math.cos(-scratch.euler.y)
    const sin = Math.sin(-scratch.euler.y)
    const into = (point: Vector3): readonly number[] => {
      const dx = point.x - scratch.hips.x
      const dz = point.z - scratch.hips.z
      return [dx * cos + dz * sin, point.y, dz * cos - dx * sin]
    }

    return { hips: [0, scratch.hips.y, 0], left: into(scratch.left), right: into(scratch.right) }
  }
}
