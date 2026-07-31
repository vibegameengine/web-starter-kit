import { useCallback, useEffect, useRef, useState } from 'react'

import { ControlButton, ControlChoice, ControlPanel } from '../../ui-kit'
import type { RagdollApi } from '../entities/Ragdoll'
import { RagdollLabScene } from '../../../scenes/ragdoll-lab/RagdollLabScene'
import type { RagdollLabActions } from '../../../scenes/ragdoll-lab/labActions'
import { PROJECTILE_SHAPES, type ProjectileShapeId } from '../../../scenes/ragdoll-lab/projectileShapes'
import { ragdollSurfaceSamples } from '../catalog/ragdollSurfaceCatalog'
import { START_POSES } from '../systems/startPoses'
import styles from './RagdollLabScreen.module.css'

const POSE_OPTIONS = START_POSES.map((pose) => ({ id: pose.id, label: pose.label }))
const SURFACE_OPTIONS = ragdollSurfaceSamples.map((sample) => ({ id: sample.id, label: sample.label }))
const SHAPE_OPTIONS = PROJECTILE_SHAPES.map((shape) => ({ id: shape.id, label: shape.label }))

/**
 * Gravity presets rather than a slider: the three cases anyone actually wants to
 * see are earth, something much weaker — where the collapse plays out slowly
 * enough to read joint by joint — and none at all, where a spin or a throw can be
 * watched without the floor ending it.
 */
const GRAVITY_OPTIONS = [
  { id: 'earth', label: 'Earth', value: -9.81 },
  { id: 'moon', label: 'Moon', value: -1.62 },
  { id: 'zero', label: 'Zero', value: 0 },
] as const

type GravityId = (typeof GRAVITY_OPTIONS)[number]['id']

/** DEV-only lab for the physics ragdoll: a body, and every way to abuse it. */
export function RagdollLabScreen() {
  const [poseId, setPoseId] = useState(START_POSES[0].id)
  const [surfaceId, setSurfaceId] = useState<string>(ragdollSurfaceSamples[0].id)
  const [shapeId, setShapeId] = useState<ProjectileShapeId>(PROJECTILE_SHAPES[0].id)
  const [gravityId, setGravityId] = useState<GravityId>('earth')
  const [debugColliders, setDebugColliders] = useState(false)
  // The panel can be taken out of the frame entirely. It is a corner panel, not a
  // full-width one, but a lab's whole output is the picture — and the moment you
  // want to judge one, the controls are the only thing in the way.
  const [panelVisible, setPanelVisible] = useState(true)
  const [runId, setRunId] = useState(0)

  const pose = START_POSES.find((candidate) => candidate.id === poseId) ?? START_POSES[0]
  const gravity = GRAVITY_OPTIONS.find((candidate) => candidate.id === gravityId) ?? GRAVITY_OPTIONS[0]

  const apiRef = useRef<RagdollApi | null>(null)
  // Filled by the in-canvas components on mount. An empty object rather than
  // null, so the panel can call through it before the canvas has mounted without
  // every handler having to check.
  const actionsRef = useRef<RagdollLabActions>({})

  // Changing the pose also stands the body back up: judging a new pose against a
  // corpse left over from the previous one is useless.
  const selectPose = useCallback((id: string) => {
    setPoseId(id)
    setRunId((previous) => previous + 1)
  }, [])
  // Same for the surface — a study starts from a body standing on it, not from
  // whatever the last one left lying there.
  const selectSurface = useCallback((id: string) => {
    setSurfaceId(id)
    setRunId((previous) => previous + 1)
  }, [])
  const reset = useCallback(() => setRunId((previous) => previous + 1), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.code === 'KeyR') reset()
      if (event.code === 'KeyH') setPanelVisible((previous) => !previous)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reset])

  return (
    <main className={styles.screen}>
      {/* The stage inside reports first-frame readiness for every lab, so this
          screen must not also claim it. */}
      <RagdollLabScene
        actionsRef={actionsRef}
        apiRef={apiRef}
        debugColliders={debugColliders}
        gravity={gravity.value}
        pose={pose}
        runId={runId}
        shapeId={shapeId}
        surfaceId={surfaceId}
      />
      <div className={styles.hud} data-testid="ragdoll-hud" hidden={!panelVisible}>
        <ControlPanel maxWidth={430} readout={`${gravity.label} · ${pose.label}`} title="Ragdoll">
          <div className={styles.controls}>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Surface</span>
              <ControlChoice
                activeId={surfaceId}
                label="Surface study"
                onSelect={selectSurface}
                options={SURFACE_OPTIONS}
                testIdPrefix="surface"
              />
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Pose</span>
              <ControlChoice
                activeId={poseId}
                label="Start pose"
                onSelect={selectPose}
                options={POSE_OPTIONS}
                testIdPrefix="pose"
              />
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Projectile</span>
              <div className={styles.row}>
                <ControlChoice
                  activeId={shapeId}
                  label="Projectile shape"
                  onSelect={(id) => setShapeId(id as ProjectileShapeId)}
                  options={SHAPE_OPTIONS}
                  testIdPrefix="shape"
                />
                <ControlButton data-testid="ragdoll-throw" onClick={() => actionsRef.current.throwShape?.()}>
                  Throw (F)
                </ControlButton>
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Body</span>
              <div className={styles.row}>
                <ControlButton data-testid="ragdoll-knockout" onClick={() => apiRef.current?.activate()}>
                  Knock out (K)
                </ControlButton>
                <ControlButton data-testid="ragdoll-spin" onClick={() => actionsRef.current.spin?.(1)}>
                  Spin (Q/E)
                </ControlButton>
                <ControlButton data-testid="ragdoll-tumble" onClick={() => actionsRef.current.tumble?.(1)}>
                  Tumble (Z/X)
                </ControlButton>
                <ControlButton data-testid="ragdoll-launch" onClick={() => actionsRef.current.launch?.()}>
                  Launch (G)
                </ControlButton>
                <ControlButton data-testid="ragdoll-reset" onClick={reset} variant="accent">
                  Stand up (R)
                </ControlButton>
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>World</span>
              <div className={styles.row}>
                <ControlChoice
                  activeId={gravityId}
                  label="Gravity"
                  onSelect={(id) => setGravityId(id as GravityId)}
                  options={GRAVITY_OPTIONS.map(({ id, label }) => ({ id, label }))}
                  testIdPrefix="gravity"
                />
                <ControlButton
                  active={debugColliders}
                  data-testid="ragdoll-debug"
                  onClick={() => setDebugColliders((previous) => !previous)}
                >
                  Colliders
                </ControlButton>
              </div>
            </div>
            <p className={styles.hint}>
              <span className={styles.key}>Drag</span> the body to haul a limb around — let go mid-swing to throw it;
              drag anywhere else to orbit. <span className={styles.key}>Space</span> shoots at the cursor,{' '}
              <span className={styles.key}>F</span> throws the projectile there,{' '}
              <span className={styles.key}>H</span> hides this panel.
            </p>
          </div>
        </ControlPanel>
      </div>
    </main>
  )
}
