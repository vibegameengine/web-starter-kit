import { Vector3 } from 'three'
import type { Object3D } from 'three'

import type { MotionTimeline } from '../../features/motion/components/useMotionController'
import type { StandReadout } from './motionStandStore'

type FeetProbe = {
  readonly contact: readonly [number, number]
  readonly locked: readonly [boolean, boolean]
  readonly pelvisDrop: number
  readonly strideScale: number
}

type MatchingProbe = {
  readonly clipId: string
  readonly phase: number
}

const point = new Vector3()

function boneNamed(rig: Object3D, pattern: RegExp): Object3D | null {
  let found: Object3D | null = null
  rig.traverse((node) => {
    if (!found && pattern.test(node.name)) found = node
  })
  return found
}

function boneHeight(rig: Object3D, pattern: RegExp): number {
  const bone = boneNamed(rig, pattern)
  return bone ? bone.getWorldPosition(point).y : 0
}

export function readStand(rig: Object3D, timeline: MotionTimeline, frame: number): StandReadout {
  const probes = window as Window & {
    __motionFeet?: () => FeetProbe
    __motionMatching?: () => MatchingProbe
  }
  const feet = probes.__motionFeet?.()
  const matching = probes.__motionMatching?.()
  const state = timeline.current

  return {
    clip: matching ? matching.clipId : 'unknown',
    contactLeft: feet ? feet.contact[0] : 0,
    contactRight: feet ? feet.contact[1] : 0,
    footLeftY: boneHeight(rig, /LeftFoot$/),
    footRightY: boneHeight(rig, /RightFoot$/),
    frame,
    hipsY: boneHeight(rig, /Hips$/),
    lockedLeft: feet ? feet.locked[0] : false,
    lockedRight: feet ? feet.locked[1] : false,
    pelvisDrop: feet ? feet.pelvisDrop : 0,
    phase: matching ? matching.phase : 0,
    speed: Math.hypot(state.velocity[0], state.velocity[2]),
    strideScale: feet ? feet.strideScale : 1,
    travelled: state.travelledMeters,
  }
}
