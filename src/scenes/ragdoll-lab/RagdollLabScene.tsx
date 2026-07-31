import { Physics } from '@react-three/rapier'
import { Suspense } from 'react'
import type { MutableRefObject, RefObject } from 'react'

import type { RagdollApi } from '../../features/ragdoll/entities/Ragdoll'
import { ragdollSurfaceFrom } from '../../features/ragdoll/catalog/ragdollSurfaceCatalog'
import type { StartPose } from '../../features/ragdoll/systems/startPoses'
import { FixedTickClock, FixedTickProvider } from '../../shared/lib/simulation/FixedTick'
import { useOwnedFixedTickBus } from '../../shared/lib/simulation/fixedTickContext'
import { LabStage } from '../lab-stage/LabStage'
import { RagdollHandling } from './RagdollHandling'
import { ThrownShapes } from './ThrownShapes'
import type { RagdollLabActions } from './labActions'
import type { ProjectileShapeId } from './projectileShapes'

/**
 * DEV lab: the Mixamo mannequin as a physics ragdoll, and a set of hands to
 * mistreat it with — grab a limb and drag it, fling it, spin it, tumble it,
 * shoot it, or throw solid shapes at it.
 *
 * The stage comes from `LabStage` rather than a canvas of its own
 * (`dev-lab-authoring` rule 2): the body is judged against the same sun, the same
 * tone mapping and the same shadow rig as the game, so a collapse that reads
 * right here reads right in a scene.
 *
 * Two things the stage is asked to switch OFF. Its ground, because every surface
 * study brings the ground the study is ABOUT — a second floor at y = 0 would sit
 * inside the trench and under the slope. And its grid, for the same reason:
 * pinned to one height, it cuts straight through anything that is not flat and
 * reads as a floor that is not there.
 */

type RagdollLabSceneProps = {
  /** Filled by the in-canvas components; read by the HUD outside it. */
  readonly actionsRef: MutableRefObject<RagdollLabActions>
  readonly apiRef: RefObject<RagdollApi | null>
  /** Collider and joint wireframes over the mesh. */
  readonly debugColliders?: boolean
  /** Metres per second squared, negative down. Zero floats the body. */
  readonly gravity?: number
  readonly pose?: StartPose
  /** Bumping this remounts the ragdoll, standing it back up for another run. */
  readonly runId?: number
  /** Which shape the thrower launches. */
  readonly shapeId: ProjectileShapeId
  /** Which surface study to stand the body on. */
  readonly surfaceId?: string
}

export function RagdollLabScene({
  actionsRef,
  apiRef,
  debugColliders = false,
  gravity = -9.81,
  pose,
  runId = 0,
  shapeId,
  surfaceId,
}: RagdollLabSceneProps) {
  const surface = ragdollSurfaceFrom(surfaceId ?? null)
  // This bench has no player and no session, so there is nothing here to hang a
  // tick off — `FixedTickClock` below IS this scene's clock, its first and only
  // one. The body's ramps must age at the game's 30 Hz here too, or the bench
  // proves nothing about the game.
  const tick = useOwnedFixedTickBus()

  return (
    // Back and high enough to hold the pad, the steps, the slope and the trench
    // in one frame — a fall is judged against the feature it lands on. The sun's
    // shadow box is pulled in to the pad, because a stage-sized one spends its
    // resolution on ground nothing stands on.
    <LabStage
      camera={{ far: 80, fov: 42, near: 0.1, position: [5, 3.4, 5.8] }}
      grid={false}
      ground={false}
      orbit={{ target: [0.4, 0.8, 0] }}
      // The frame IS the instrument here — a body mid-flight is judged on where
      // it goes — so the perf panel stays out of it. "P" brings it back.
      perf={false}
      sun={{ radius: 10 }}
    >
      {/* A FIXED step, because "vary" hands the solver the frame delta and a
          stalled frame is measured in seconds.
          
          Measured: with "vary", blocking the page's main thread for 3 s while the
          corpse lay asleep launched it from y = 0.15 to y = 29.8 in two seconds
          and it never came back. The binding clamps a varying delta at 0.5 s and
          takes ONE step with it — half a second of gravity applied in a single
          integration across eleven jointed bodies. A fixed step splits the same
          stall into sub-steps and the island survives it.
          
          What this costs: the ragdoll drives bones from the raw solver pose
          (rapier's interpolation only lerps the binding's managed objects, not
          our bodies), so above 60 Hz a bone holds its pose for a frame or two
          before moving. That is a smoothness artefact on a corpse; the
          alternative was the corpse leaving the level. Interpolating our own
          write-back is the way to get both back. */}
      <Physics debug={debugColliders} gravity={[0, gravity, 0]} numSolverIterations={12} timeStep={1 / 60}>
        <FixedTickProvider bus={tick}>
          <FixedTickClock bus={tick} />
          <Suspense fallback={null}>
            {/* The study owns both its ground and its body, so one surface is
                never judged against a body that fell partly onto another. */}
            <surface.Component apiRef={apiRef} pose={pose} runId={runId} />
          </Suspense>
        </FixedTickProvider>
        <RagdollHandling actionsRef={actionsRef} apiRef={apiRef} />
        <ThrownShapes actionsRef={actionsRef} apiRef={apiRef} runId={runId} shapeId={shapeId} />
      </Physics>
    </LabStage>
  )
}
