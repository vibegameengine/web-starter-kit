import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Group } from 'three'

import type { RagdollApi } from '../entities/Ragdoll'
import { RagdollCharacter } from '../entities/RagdollCharacter'
import type { StartPose } from '../systems/startPoses'
import { Ramp, Riser, Slab } from './surfacePieces'

/**
 * One surface per study, each with its own body, inspected on its own.
 *
 * Crowding every kind of ground into a single bench was the wrong shape for the
 * question. A body that lands between a step and a kerb tells you nothing about
 * either: whatever went wrong could have come from the feature being watched or
 * from the one that was not, and after the fact the two cannot be separated.
 *
 * And the body has to START on the feature, not beside it. A study that stands it
 * on flat ground with steps somewhere nearby only tests whether it happens to
 * tumble that way — the interesting part, a body already standing on an edge or a
 * slope when it goes limp, never happens. So each layout is authored around the
 * origin: whatever the study is about is directly underfoot, because the physics
 * bodies are built from the model's own world transforms and the body itself
 * cannot be moved to meet it.
 *
 * Flat ground stays as the baseline — it is what everything was tuned on, and a
 * regression there has to be visible.
 */

export type SurfaceSampleProps = {
  readonly apiRef: RefObject<RagdollApi | null>
  readonly pose?: StartPose
  /** Remount key: changing it stands a fresh body up for another run. */
  readonly runId: number
}

/** The body, placed the only way it can be: at the origin, feet at y = 0. */
function Body({ apiRef, pose, runId, surface }: SurfaceSampleProps & { readonly surface: string }) {
  return <RagdollCharacter key={`${surface}-${pose?.id ?? 'tpose'}-${runId}`} apiRef={apiRef} pose={pose} />
}

/** Baseline: level ground, the case everything else is a departure from. */
export function FlatSurfaceSample(props: SurfaceSampleProps) {
  return (
    <>
      <Slab position={[0, 0]} size={[14, 14]} />
      <Body {...props} surface="flat" />
    </>
  )
}

const TREAD = 0.62
const RISE = 0.19

/**
 * Standing ON a flight, mid-way down it. The tread under the body is at walking
 * height, the flight climbs behind and falls away in front, so a body that goes
 * limp here starts its collapse already on an edge and travels over several more.
 */
export function StepsSurfaceSample(props: SurfaceSampleProps) {
  return (
    <>
      {/* Upper landing, then two treads up behind the body (−X). */}
      <Slab position={[-4.2, 0]} size={[5, 4]} top={RISE * 3} />
      <Slab position={[-1.7 - TREAD, 0]} size={[TREAD, 4]} top={RISE * 2} />
      <Slab position={[-1.7, 0]} size={[TREAD, 4]} top={RISE} />
      {/* The tread the body stands on, its top exactly at foot level. */}
      <Slab position={[-1.7 + TREAD, 0]} size={[TREAD, 4]} top={0} />
      {/* Three treads falling away in front (+X), then the lower floor. */}
      <Slab position={[-1.7 + TREAD * 2, 0]} size={[TREAD, 4]} top={-RISE} />
      <Slab position={[-1.7 + TREAD * 3, 0]} size={[TREAD, 4]} top={-RISE * 2} />
      <Slab position={[-1.7 + TREAD * 4, 0]} size={[TREAD, 4]} top={-RISE * 3} />
      <Slab position={[3.6, 0]} size={[6, 4]} top={-RISE * 4} />
      <Body {...props} surface="steps" />
    </>
  )
}

/**
 * Standing ON the slope, not next to it. The tilted face passes exactly through
 * the origin, so the body is on an incline from the first frame — the question
 * being whether it slides and comes to rest ALONG the slope or perches across it.
 */
const SLOPE_TILT = -0.35
const SLOPE_THICKNESS = 0.6
export function SlopeSurfaceSample(props: SurfaceSampleProps) {
  // Put the slab's TOP face through (0,0,0): step back from the origin along the
  // face normal by half the thickness. Placing the slab at the origin instead
  // would bury the body up to the shins in it.
  const normalX = -Math.sin(SLOPE_TILT)
  const normalY = Math.cos(SLOPE_TILT)
  const centre = [-normalX * (SLOPE_THICKNESS / 2), -normalY * (SLOPE_THICKNESS / 2), 0] as const
  return (
    <>
      <Ramp position={centre} size={[11, SLOPE_THICKNESS, 7]} tilt={SLOPE_TILT} />
      {/* Run-out at the bottom of the slope so the body has somewhere to finish. */}
      <Slab position={[8.4, 0]} size={[6, 7]} top={-Math.tan(-SLOPE_TILT) * 5.5} />
      <Body {...props} surface="slope" />
    </>
  )
}

/**
 * Standing ON the lip. The ground stops a boot's width in front of the body, so
 * going limp here drops it over the edge rather than merely toward it.
 */
export function LedgeSurfaceSample(props: SurfaceSampleProps) {
  const lip = 0.28
  return (
    <>
      <Slab position={[lip - 5, 0]} size={[10, 8]} />
      <Slab position={[lip + 3.5, 0]} size={[7, 8]} top={-1.1} />
      <Body {...props} surface="ledge" />
    </>
  )
}

/**
 * Standing ASTRIDE a kerb — one foot up, one down. Uneven footing before anything
 * even happens, which is the case a level bench can never produce.
 */
export function ObstaclesSurfaceSample(props: SurfaceSampleProps) {
  return (
    <>
      {/* Floor one kerb-height below foot level, so the kerb top IS foot level. */}
      <Slab position={[0, 0]} size={[14, 14]} top={-0.16} />
      {/* The kerb under the body: its top at y = 0, edge running through the origin
          so the body straddles it rather than standing squarely on top. */}
      <Riser position={[0.34, -0.08, 0]} size={[0.68, 0.16, 3]} />
      {/* A low wall a topple away, to drape a torso over. */}
      <Riser position={[0, 0.06, 1.5]} size={[3.2, 0.44, 0.32]} />
      {/* A block to fall across, leaving the body bridging two heights. */}
      <Riser position={[1.9, 0.14, -1.7]} size={[1, 0.6, 1]} />
      <Body {...props} surface="obstacles" />
    </>
  )
}

/**
 * How high the carrier below holds the body. Any non-zero value reproduces the
 * defect; this one is a plausible piece of terrain and big enough to read on a
 * screenshot without the body leaving frame.
 */
const CARRIED_HEIGHT_METERS = 2.4

/**
 * A parent group that moves what is drawn, and nothing else.
 *
 * This is the raid's terrain lift, reduced to its essence: a group whose Y is
 * written every frame so the actor inside it is grounded on ground that is not
 * at zero. It is written from a frame callback rather than set as a static
 * position deliberately — a static offset would be a fair test of the maths and
 * an unfair test of the timing, and the raid's version moves.
 */
function Carrier({ children, height }: { readonly children: ReactNode; readonly height: number }) {
  const lift = useRef<Group>(null)
  useFrame(() => {
    const group = lift.current
    if (group) group.position.y = height
  })
  return <group ref={lift}>{children}</group>
}

/**
 * The body standing on ground that is not at zero, CARRIED there by a parent
 * group instead of standing there itself.
 *
 * This is the one study that is not about the shape of the ground. It is about
 * the scene graph, and it exists because the raid puts its player exactly here:
 * a lift group grounds him on the carved terrain by writing its own Y, and his
 * ragdoll hangs underneath it. A ragdoll's rigid bodies live in WORLD space
 * while that group moves only what is drawn, so the solver and the renderer end
 * up describing two bodies a lift apart — and the corpse arrives as a heap.
 *
 * Every other study here stands its body at y = 0 and moves the GROUND, which is
 * why none of them ever caught it. The ground here is flat and ordinary; the
 * defect is entirely in who is holding the body.
 */
export function CarriedSurfaceSample(props: SurfaceSampleProps) {
  return (
    <>
      <Slab position={[0, 0]} size={[14, 14]} top={CARRIED_HEIGHT_METERS} />
      <Carrier height={CARRIED_HEIGHT_METERS}>
        <Body {...props} surface="carried" />
      </Carrier>
    </>
  )
}
