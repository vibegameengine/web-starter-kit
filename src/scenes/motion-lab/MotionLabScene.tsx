import { Instance, Instances } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'

import { useMannequinRig } from '../../features/motion/components/useMannequinRig'
import { AnimatedBody } from '../../features/motion/entities/AnimatedBody'
import { MotionMatchedBody } from '../../features/motion/entities/MotionMatchedBody'

import { MotionBody } from '../../features/motion/entities/MotionBody'
import { useKeyboardMotionIntent } from '../../features/motion/components/useKeyboardMotionIntent'
import { useMouseLook } from '../../features/motion/components/useMouseLook'
import { useMotionController } from '../../features/motion/components/useMotionController'
import { DEFAULT_THIRD_PERSON_CAMERA, useThirdPersonCamera } from '../../features/motion/components/useThirdPersonCamera'
import { createBoxWorldTrace, type Vector3Tuple } from '../../features/motion/systems/boxTrace'
import type { MotionSettings, RotationMode } from '../../features/motion/systems/motionController'
import type { MotionProfile } from '../../features/motion/systems/motionProfile'
import { HUMAN_TURN_PROFILE } from '../../features/motion/systems/turnDynamics'
import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { FixedTickClock, FixedTickProvider } from '../../shared/lib/simulation/FixedTick'
import { useFixedTick, useOwnedFixedTickBus } from '../../shared/lib/simulation/fixedTickContext'
import { LabStage } from '../lab-stage/LabStage'
import {
  MOTION_LAB_BLOCKS,
  MOTION_LAB_SOLIDS,
  MOTION_LAB_START,
  MOTION_LAB_WARP_EVENT,
} from './motionLabCourse'
import { MOTION_READOUT_INTERVAL_SECONDS, type MotionReadoutStore } from './motionReadoutStore'

const BODY_HALF_EXTENTS: Vector3Tuple = [0.3, 0.9, 0.3]
const SIMULATION_HZ = 60


export type AnimationMode = 'blend' | 'matching'

export type MotionLabSceneProps = {
  readonly animation: AnimationMode
  readonly paused: boolean
  readonly profile: MotionProfile
  readonly readout: MotionReadoutStore
  readonly rotationMode: RotationMode
  readonly showCollider: boolean
}

function CourseBlocks() {
  return (
    <Instances castShadow limit={MOTION_LAB_BLOCKS.length} receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color="#8d8f93" roughness={0.85} />
      {MOTION_LAB_BLOCKS.map((block, index) => (
        <Instance
          key={`block-${index}`}
          position={[block.center[0], block.center[1], block.center[2]]}
          scale={[block.halfExtents[0] * 2, block.halfExtents[1] * 2, block.halfExtents[2] * 2]}
        />
      ))}
    </Instances>
  )
}

function useWarpStations(warp: (position: Vector3Tuple) => void): void {
  useEffect(() => {
    const onWarp = (event: Event) => {
      const detail = (event as CustomEvent<Vector3Tuple>).detail
      if (detail) warp(detail)
    }
    window.addEventListener(MOTION_LAB_WARP_EVENT, onWarp)
    return () => window.removeEventListener(MOTION_LAB_WARP_EVENT, onWarp)
  }, [warp])
}

function MotionLabSubject({ animation, profile, readout, rotationMode, showCollider }: Omit<MotionLabSceneProps, 'paused'>) {
  const intent = useKeyboardMotionIntent()
  const look = useMouseLook()
  const settings = useMemo<MotionSettings>(() => ({
    halfExtents: BODY_HALF_EXTENTS,
    profile,
    rotationMode,
    trace: createBoxWorldTrace(MOTION_LAB_SOLIDS),
    turnProfile: HUMAN_TURN_PROFILE,
  }), [profile, rotationMode])

  const rig = useMannequinRig(-BODY_HALF_EXTENTS[1])
  const { timeline, warp } = useMotionController({
    aimYaw: look.yaw,
    intent,
    settings,
    start: MOTION_LAB_START,
  })
  useWarpStations(warp)

  const sinceReadout = useRef(0)
  useFixedTick((delta) => {
    sinceReadout.current += delta
    if (sinceReadout.current < MOTION_READOUT_INTERVAL_SECONDS) return
    sinceReadout.current -= MOTION_READOUT_INTERVAL_SECONDS
    readout.publish(timeline.current.current)
  })

  useThirdPersonCamera(timeline, useMemo(
    () => ({ ...DEFAULT_THIRD_PERSON_CAMERA, orbit: look.orbit, trace: settings.trace }),
    [look.orbit, settings.trace],
  ))

  return (
    <ShadowGroup kind="dynamic">
      <MotionBody collider={showCollider ? BODY_HALF_EXTENTS : undefined} timeline={timeline}>
        {animation === 'matching' ? (
          <MotionMatchedBody
            aimYaw={look.yaw}
            intent={intent}
            profile={profile}
            rig={rig}
            timeline={timeline}
            topSpeed={profile.maxSpeed}
            trace={settings.trace}
          />
        ) : (
          <AnimatedBody rig={rig} timeline={timeline} trace={settings.trace} />
        )}
      </MotionBody>
    </ShadowGroup>
  )
}

export function MotionLabScene({ animation, paused, profile, readout, rotationMode, showCollider }: MotionLabSceneProps) {
  const bus = useOwnedFixedTickBus()

  return (
    <LabStage camera={{ position: [0, 5, -11] }} groundSize={90} orbit={false}>
      <FixedTickClock bus={bus} paused={paused} stepHz={SIMULATION_HZ} />
      <ShadowGroup kind="static">
        <CourseBlocks />
      </ShadowGroup>
      <FixedTickProvider bus={bus}>
        <MotionLabSubject
          animation={animation}
          profile={profile}
          readout={readout}
          rotationMode={rotationMode}
          showCollider={showCollider}
        />
      </FixedTickProvider>
    </LabStage>
  )
}
