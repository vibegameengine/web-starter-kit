import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { ControlButton, ControlChoice, ControlPanel } from '../../ui-kit'
import { MotionStandScene } from '../../../scenes/motion-stand/MotionStandScene'
import {
  createStandStore,
  MOTION_STAND_RESET_EVENT,
  MOTION_STAND_STEP_EVENT,
} from '../../../scenes/motion-stand/motionStandStore'
import styles from './MotionStandScreen.module.css'

const FACING_OPTIONS = [
  { id: 'travel', label: 'Face travel' },
  { id: 'aim', label: 'Face aim' },
] as const

type FacingId = (typeof FACING_OPTIONS)[number]['id']

const DRIVE_OPTIONS = [
  { forward: 0, id: 'still', label: 'Still', right: 0 },
  { forward: 1, id: 'forward', label: 'Forward', right: 0 },
  { forward: -1, id: 'backward', label: 'Backward', right: 0 },
  { forward: 0, id: 'strafe', label: 'Strafe right', right: 1 },
  { forward: 1, id: 'diagonal', label: 'Diagonal', right: 1 },
] as const

type DriveId = (typeof DRIVE_OPTIONS)[number]['id']

function fire(event: string, detail?: number): void {
  const focused = document.activeElement
  if (focused instanceof HTMLElement) focused.blur()
  window.dispatchEvent(new CustomEvent(event, { detail }))
}

export function MotionStandScreen() {
  /* eslint-disable no-restricted-syntax -- each is a button a person presses on
     a bench that renders on demand; nothing here runs per frame. */
  const [driveId, setDriveId] = useState<DriveId>('forward')
  const [sprint, setSprint] = useState(false)
  const [facing, setFacing] = useState<FacingId>('travel')
  /* eslint-enable no-restricted-syntax */

  const readout = useMemo(() => createStandStore(), [])
  const frame = useSyncExternalStore(readout.subscribe, readout.getSnapshot)
  const drive = DRIVE_OPTIONS.find((option) => option.id === driveId) ?? DRIVE_OPTIONS[1]
  const step = useCallback((count: number) => fire(MOTION_STAND_STEP_EVENT, count), [])

  return (
    <div className={styles.screen}>
      <MotionStandScene
        facing={facing}
        forward={drive.forward}
        key={facing}
        readout={readout}
        right={drive.right}
        sprint={sprint}
      />
      <div className={styles.panel}>
        <ControlPanel data-testid="motion-stand-panel" readout={`frame ${frame.frame}`} title="Motion stand">
          <ControlChoice
            activeId={driveId}
            label="Drive"
            onSelect={(id) => {
              const focused = document.activeElement
              if (focused instanceof HTMLElement) focused.blur()
              setDriveId(id as DriveId)
            }}
            options={DRIVE_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
            testIdPrefix="motion-stand-drive"
          />
          <ControlChoice
            activeId={facing}
            label="Body facing"
            onSelect={(id) => {
              const focused = document.activeElement
              if (focused instanceof HTMLElement) focused.blur()
              setFacing(id as FacingId)
            }}
            options={FACING_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
            testIdPrefix="motion-stand-facing"
          />
          <div className={styles.numbers} data-testid="motion-stand-readout">
            <span>clip {frame.clip}</span>
            <span>phase {frame.phase.toFixed(3)}</span>
            <span>speed {frame.speed.toFixed(3)} m/s</span>
            <span>travelled {frame.travelled.toFixed(3)} m</span>
            <span>stride {frame.strideScale.toFixed(3)}</span>
            <span>pelvis drop {frame.pelvisDrop.toFixed(3)}</span>
            <span>contact L {frame.contactLeft.toFixed(2)}{frame.lockedLeft ? ' lock' : ''}</span>
            <span>contact R {frame.contactRight.toFixed(2)}{frame.lockedRight ? ' lock' : ''}</span>
            <span>foot L y {frame.footLeftY.toFixed(3)}</span>
            <span>foot R y {frame.footRightY.toFixed(3)}</span>
            <span>hips y {frame.hipsY.toFixed(3)}</span>
          </div>
          <div className={styles.actions}>
            <ControlButton data-testid="motion-stand-step-1" onClick={() => step(1)} variant="accent">
              Step 1
            </ControlButton>
            <ControlButton data-testid="motion-stand-step-5" onClick={() => step(5)}>
              Step 5
            </ControlButton>
            <ControlButton data-testid="motion-stand-step-30" onClick={() => step(30)}>
              Step 30
            </ControlButton>
            <ControlButton
              active={sprint}
              data-testid="motion-stand-sprint"
              onClick={() => {
                const focused = document.activeElement
                if (focused instanceof HTMLElement) focused.blur()
                setSprint((previous) => !previous)
              }}
            >
              Sprint
            </ControlButton>
            <ControlButton data-testid="motion-stand-reset" onClick={() => fire(MOTION_STAND_RESET_EVENT)}>
              Reset
            </ControlButton>
          </div>
          <p className={styles.legend}>
            One simulated frame per step, at sixty steps to the second. The canvas renders on demand, so what
            you see is the frame the numbers describe.
          </p>
        </ControlPanel>
      </div>
    </div>
  )
}
