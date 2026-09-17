import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { ControlButton, ControlChoice, ControlPanel } from '../../ui-kit'
import { MotionLabScene, type AnimationMode } from '../../../scenes/motion-lab/MotionLabScene'
import { MOTION_LAB_STATIONS, MOTION_LAB_WARP_EVENT } from '../../../scenes/motion-lab/motionLabCourse'
import { createMotionReadoutStore } from '../../../scenes/motion-lab/motionReadoutStore'
import type { RotationMode } from '../systems/motionController'
import { WALK_CLIP_SPEED } from '../catalog/locomotionClips'
import { ARENA_MOTION_PROFILE, GROUNDED_MOTION_PROFILE, profileAtSpeed } from '../systems/motionProfile'

const WALK_ONLY_PROFILE = profileAtSpeed(GROUNDED_MOTION_PROFILE, WALK_CLIP_SPEED)
import styles from './MotionLabScreen.module.css'

const PROFILE_OPTIONS = [
  { id: 'walk', label: 'Walk', value: WALK_ONLY_PROFILE },
  { id: 'grounded', label: 'Grounded', value: GROUNDED_MOTION_PROFILE },
  { id: 'arena', label: 'Arena', value: ARENA_MOTION_PROFILE },
] as const

const ANIMATION_OPTIONS = [
  { id: 'matching', label: 'Motion matching' },
  { id: 'blend', label: 'Gait blend' },
] as const

const ROTATION_OPTIONS = [
  { id: 'orient-to-movement', label: 'Face travel' },
  { id: 'follow-aim', label: 'Face aim' },
] as const

type ProfileId = (typeof PROFILE_OPTIONS)[number]['id']

/* @important A panel button that keeps keyboard focus is fired again by Space
   and Enter, and Space is the jump key: holding it re-triggered the focused
   station button and warped the body back mid-jump. */
function dropFocus(): void {
  const focused = document.activeElement
  if (focused instanceof HTMLElement) focused.blur()
}

export function MotionLabScreen() {
  /* eslint-disable no-restricted-syntax -- every one of these is a button a
     person presses, and each rebuilds or re-parameterises the scene below. The
     body's own motion never passes through React: it is published to a store
     the readout subscribes to. */
  const [profileId, setProfileId] = useState<ProfileId>('walk')
  const [animation, setAnimation] = useState<AnimationMode>('matching')
  const [rotationMode, setRotationMode] = useState<RotationMode>('orient-to-movement')
  const [showCollider, setShowCollider] = useState(true)
  const [paused, setPaused] = useState(false)
  const [runId, setRunId] = useState(0)
  const [panelVisible, setPanelVisible] = useState(true)
  /* eslint-enable no-restricted-syntax */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyH' && !event.repeat) setPanelVisible((previous) => !previous)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const readout = useMemo(() => createMotionReadoutStore(), [])
  const snapshot = useSyncExternalStore(readout.subscribe, readout.getSnapshot)
  const profile = PROFILE_OPTIONS.find((option) => option.id === profileId) ?? PROFILE_OPTIONS[0]
  const reset = useCallback(() => {
    dropFocus()
    setRunId((previous) => previous + 1)
  }, [])
  const warpTo = useCallback((position: readonly [number, number, number]) => {
    dropFocus()
    window.dispatchEvent(new CustomEvent(MOTION_LAB_WARP_EVENT, { detail: position }))
  }, [])

  return (
    <div className={styles.screen}>
      <MotionLabScene
        animation={animation}
        key={`${runId}-${profileId}-${animation}`}
        paused={paused}
        profile={profile.value}
        readout={readout}
        rotationMode={rotationMode}
        showCollider={showCollider}
      />
      <div className={styles.panel} hidden={!panelVisible}>
        <ControlPanel
          data-testid="motion-lab-panel"
          readout={`${snapshot.mode} · ${snapshot.speed.toFixed(2)} m/s`}
          title="Motion"
        >
          <ControlChoice
            activeId={profileId}
            label="Movement profile"
            onSelect={(id) => {
              dropFocus()
              setProfileId(id as ProfileId)
            }}
            options={PROFILE_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
            testIdPrefix="motion-profile"
          />
          <ControlChoice
            activeId={animation}
            label="Animation"
            onSelect={(id) => {
              dropFocus()
              setAnimation(id as AnimationMode)
            }}
            options={ANIMATION_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
            testIdPrefix="motion-animation"
          />
          <ControlChoice
            activeId={rotationMode}
            label="Body rotation"
            onSelect={(id) => {
              dropFocus()
              setRotationMode(id as RotationMode)
            }}
            options={ROTATION_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
            testIdPrefix="motion-rotation"
          />
          <div className={styles.readout} data-testid="motion-lab-readout">
            <span>stride {snapshot.locomotion}</span>
            <span>height {snapshot.height.toFixed(2)} m</span>
            <span>step {snapshot.steppedUp.toFixed(3)} m</span>
            <span>at {snapshot.x.toFixed(2)}, {snapshot.z.toFixed(2)}</span>
          </div>
          <div className={styles.actions}>
            {MOTION_LAB_STATIONS.map((station) => (
              <ControlButton
                data-testid={`motion-station-${station.id}`}
                key={station.id}
                onClick={() => warpTo(station.position)}
              >
                {station.label}
              </ControlButton>
            ))}
          </div>
          <div className={styles.actions}>
            <ControlButton
              active={showCollider}
              data-testid="motion-toggle-collider"
              onClick={() => {
                dropFocus()
                setShowCollider((previous) => !previous)
              }}
            >
              Collider
            </ControlButton>
            <ControlButton
              active={paused}
              data-testid="motion-toggle-pause"
              onClick={() => {
                dropFocus()
                setPaused((previous) => !previous)
              }}
            >
              Pause
            </ControlButton>
            <ControlButton data-testid="motion-reset" onClick={reset} variant="accent">
              Reset
            </ControlButton>
          </div>
          <p className={styles.legend}>WASD move · Shift sprint · Space jump · Ctrl crouch · H hides this panel</p>
        </ControlPanel>
      </div>
    </div>
  )
}
