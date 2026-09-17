import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Mesh, MeshStandardMaterial } from 'three'
import type { Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import mannequinUrl from '../../features/ragdoll/assets/models/default-humanoid.fbx?fbx=raw'
import { MotionMatchedBody } from '../../features/motion/entities/MotionMatchedBody'
import { MotionBody } from '../../features/motion/entities/MotionBody'
import { useMotionController } from '../../features/motion/components/useMotionController'
import { createBoxWorldTrace, type SolidBox, type Vector3Tuple } from '../../features/motion/systems/boxTrace'
import type { MotionSettings } from '../../features/motion/systems/motionController'
import { GROUNDED_MOTION_PROFILE, profileAtSpeed } from '../../features/motion/systems/motionProfile'
import { DIRECTION_SPEED_SHARES, WALK_CLIP_SPEED } from '../../features/motion/catalog/locomotionClips'
import { HUMAN_TURN_PROFILE } from '../../features/motion/systems/turnDynamics'
import type { MotionIntent } from '../../features/motion/systems/motionIntent'
import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { FixedTickProvider } from '../../shared/lib/simulation/FixedTick'
import type { FixedTickBus } from '../../shared/lib/simulation/fixedTickBus'
import { useOwnedFixedTickBus } from '../../shared/lib/simulation/fixedTickContext'
import { LabStage } from '../lab-stage/LabStage'
import { type StandStore } from './motionStandStore'
import { useStandStepping } from './useStandStepping'

const BODY_HALF_EXTENTS: Vector3Tuple = [0.3, 0.9, 0.3]
const FLOOR: SolidBox = { center: [0, -1, 0], halfExtents: [40, 1, 40] }
const START: Vector3Tuple = [0, 0.9, 0]
const bodyMaterial = new MeshStandardMaterial({ color: '#b9743f', roughness: 0.72 })

export type MotionStandSceneProps = {
  readonly facing: 'aim' | 'travel'
  readonly forward: number
  readonly readout: StandStore
  readonly right: number
  readonly sprint: boolean
}

type StandSubjectProps = MotionStandSceneProps & {
  readonly bus: FixedTickBus
}

function useMannequin(): Object3D {
  const { scene } = useGLTF(mannequinUrl)
  return useMemo(() => {
    const rig = cloneSkinned(scene)
    rig.position.set(0, -BODY_HALF_EXTENTS[1], 0)
    rig.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) mesh.material = bodyMaterial
      mesh.frustumCulled = false
    })
    return rig
  }, [scene])
}

function StandSubject({ bus, facing, forward, readout, right, sprint }: StandSubjectProps) {
  const rig = useMannequin()
  const aimYaw = useRef(0)
  const frame = useRef(0)
  const invalidate = useThree((state) => state.invalidate)
  const settings = useMemo<MotionSettings>(() => ({
    halfExtents: BODY_HALF_EXTENTS,
    profile: profileAtSpeed(GROUNDED_MOTION_PROFILE, WALK_CLIP_SPEED, DIRECTION_SPEED_SHARES),
    rotationMode: facing === 'aim' ? 'follow-aim' : 'orient-to-movement',
    trace: createBoxWorldTrace([FLOOR]),
    turnProfile: HUMAN_TURN_PROFILE,
  }), [facing])

  const held = useRef({ forward, right, sprint })
  held.current = { forward, right, sprint }
  const intent = useMemo(() => ({
    read: (yaw: number): MotionIntent => ({
      crouch: false,
      forward: held.current.forward,
      jump: false,
      right: held.current.right,
      sprint: held.current.sprint,
      yaw,
    }),
  }), [])

  const { timeline, warp } = useMotionController({ aimYaw, intent, settings, start: START })

  useStandStepping({ bus, frame, invalidate, readout, rig, start: START, timeline, warp })

  return (
    <ShadowGroup kind="dynamic">
      <MotionBody collider={BODY_HALF_EXTENTS} timeline={timeline}>
        <MotionMatchedBody
          aimYaw={aimYaw}
          intent={intent}
          rig={rig}
          timeline={timeline}
          topSpeed={settings.profile.maxSpeed}
          trace={settings.trace}
        />
      </MotionBody>
    </ShadowGroup>
  )
}

export function MotionStandScene(props: MotionStandSceneProps) {
  const bus = useOwnedFixedTickBus()

  return (
    <LabStage
      camera={{ position: [2.6, 1.3, 2.6] }}
      frameloop="demand"
      groundSize={24}
      orbit={{ maxDistance: 8, minDistance: 1, target: [0, 0.9, 0] }}
    >
      <FixedTickProvider bus={bus}>
        <StandSubject {...props} bus={bus} />
      </FixedTickProvider>
    </LabStage>
  )
}
