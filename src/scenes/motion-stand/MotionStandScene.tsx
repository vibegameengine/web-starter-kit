/* eslint-disable react-hooks/refs -- the bench hands the current drive to a
   simulation that reads it per tick, not to the render. */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useMannequinRig } from '../../features/motion/components/useMannequinRig'
import { MotionMatchedBody } from '../../features/motion/entities/MotionMatchedBody'
import type { ProceduralPasses } from '../../features/motion/systems/proceduralPasses'
import { MotionBody } from '../../features/motion/entities/MotionBody'
import { useMotionController } from '../../features/motion/components/useMotionController'
import { createBoxWorldTrace, type Vector3Tuple } from '../../features/motion/systems/boxTrace'
import type { MotionSettings } from '../../features/motion/systems/motionController'
import { CLIP_SPRINT_MULTIPLIER, GROUNDED_MOTION_PROFILE, profileAtSpeed } from '../../features/motion/systems/motionProfile'
import { DIRECTION_SPEED_SHARES, WALK_CLIP_SPEED } from '../../features/motion/catalog/locomotionClips'
import { HUMAN_TURN_PROFILE } from '../../features/motion/systems/turnDynamics'
import type { MotionIntent } from '../../features/motion/systems/motionIntent'
import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { FixedTickProvider } from '../../shared/lib/simulation/FixedTick'
import type { FixedTickBus } from '../../shared/lib/simulation/fixedTickBus'
import { useOwnedFixedTickBus } from '../../shared/lib/simulation/fixedTickContext'
import { LabStage } from '../lab-stage/LabStage'
import { MOTION_STAND_JUMP_EVENT, MOTION_STAND_RESET_EVENT, type StandStore } from './motionStandStore'
import { STAND_COURSES, surfaceHeightAt, type StandCourseId } from './standCourses'
import { useStandStepping } from './useStandStepping'

const BODY_HALF_EXTENTS: Vector3Tuple = [0.3, 0.9, 0.3]
const START: Vector3Tuple = [0, 0.9, 0]

export type MotionStandSceneProps = {
  readonly course: StandCourseId
  readonly facing: 'aim' | 'travel'
  readonly forward: number
  readonly passes: ProceduralPasses
  readonly readout: StandStore
  readonly right: number
  readonly sprint: boolean
}

type StandSubjectProps = MotionStandSceneProps & {
  readonly bus: FixedTickBus
}


/* @important The course geometry goes out in DEV so a check can ask what is
   under a foot without asking the pass that placed it. A check that reads the
   ground from the same probe the pass uses agrees with it by construction, and
   it did: it could not tell a foot on the wrong tread from a foot on the right
   one. */
function useSurfaceOracle(course: StandCourseId): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const target = window as Window & { __standSurfaceAt?: (x: number, z: number) => number }
    target.__standSurfaceAt = (x, z) => surfaceHeightAt(STAND_COURSES[course], x, z)
    return () => {
      delete target.__standSurfaceAt
    }
  }, [course])
}

function CourseBlocks({ course }: { readonly course: StandCourseId }) {
  useSurfaceOracle(course)
  return (
    <>
      {STAND_COURSES[course].slice(1).map((box, index) => (
        <mesh key={`${course}-${index}`} position={box.center as unknown as [number, number, number]} receiveShadow>
          <boxGeometry args={[box.halfExtents[0] * 2, box.halfExtents[1] * 2, box.halfExtents[2] * 2]} />
          <meshStandardMaterial color="#8d8f94" roughness={0.9} />
        </mesh>
      ))}
    </>
  )
}

function consume(flag: { current: boolean }): boolean {
  const was = flag.current
  flag.current = false
  return was
}

function StandSubject({ bus, course, facing, forward, passes, readout, right, sprint }: StandSubjectProps) {
  const rig = useMannequinRig(-BODY_HALF_EXTENTS[1])
  const aimYaw = useRef(0)
  const frame = useRef(0)
  const invalidate = useThree((state) => state.invalidate)
  const settings = useMemo<MotionSettings>(() => ({
    halfExtents: BODY_HALF_EXTENTS,
    profile: profileAtSpeed(GROUNDED_MOTION_PROFILE, WALK_CLIP_SPEED, DIRECTION_SPEED_SHARES, CLIP_SPRINT_MULTIPLIER),
    rotationMode: facing === 'aim' ? 'follow-aim' : 'orient-to-movement',
    trace: createBoxWorldTrace(STAND_COURSES[course]),
    turnProfile: HUMAN_TURN_PROFILE,
  }), [course, facing])

  const held = useRef({ forward, passes, right, sprint })
  held.current = { forward, passes, right, sprint }
  useEffect(() => invalidate(), [invalidate, passes])
  const jumpPressed = useRef(false)
  useEffect(() => {
    const onJump = () => {
      jumpPressed.current = true
    }
    window.addEventListener(MOTION_STAND_JUMP_EVENT, onJump)
    return () => window.removeEventListener(MOTION_STAND_JUMP_EVENT, onJump)
  }, [])
  /* @important A press is consumed by the tick that reads it, so one click is
     one jump on the stepping bench however many frames are stepped after it. */
  const intent = useMemo(() => ({
    read: (yaw: number): MotionIntent => ({
      crouch: false,
      forward: held.current.forward,
      jump: consume(jumpPressed),
      right: held.current.right,
      sprint: held.current.sprint,
      yaw,
    }),
  }), [])

  const { timeline } = useMotionController({ aimYaw, intent, settings, start: START })

  useStandStepping({ bus, frame, invalidate, readout, rig, timeline })

  return (
    <>
    <CourseBlocks course={course} />
    <ShadowGroup kind="dynamic">
      <MotionBody collider={BODY_HALF_EXTENTS} timeline={timeline}>
        <MotionMatchedBody
          aimYaw={aimYaw}
          intent={intent}
          passes={() => held.current.passes}
          profile={settings.profile}
          rig={rig}
          timeline={timeline}
          topSpeed={settings.profile.maxSpeed}
          trace={settings.trace}
        />
      </MotionBody>
    </ShadowGroup>
    </>
  )
}

function useResetGeneration(): number {
  // eslint-disable-next-line no-restricted-syntax -- a reset remounts the subject once per press; nothing here runs per frame.
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    const onReset = () => setGeneration((current) => current + 1)
    window.addEventListener(MOTION_STAND_RESET_EVENT, onReset)
    return () => window.removeEventListener(MOTION_STAND_RESET_EVENT, onReset)
  }, [])
  return generation
}

export function MotionStandScene(props: MotionStandSceneProps) {
  const bus = useOwnedFixedTickBus()
  const generation = useResetGeneration()

  return (
    <LabStage
      camera={{ position: [2.6, 1.3, 2.6] }}
      frameloop="demand"
      groundSize={24}
      orbit={{ maxDistance: 8, minDistance: 1, target: [0, 0.9, 0] }}
    >
      <FixedTickProvider bus={bus}>
        <StandSubject key={generation} {...props} bus={bus} />
      </FixedTickProvider>
    </LabStage>
  )
}
