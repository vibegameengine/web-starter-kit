import { useMemo, useState, useSyncExternalStore } from 'react'

import { ControlButton, ControlChoice, ControlPanel } from '../../ui-kit'
import { MotionRetargetScene } from '../../../scenes/motion-retarget/MotionRetargetScene'
import { createRetargetStore, MOTION_RETARGET_STEP_EVENT } from '../../../scenes/motion-retarget/retargetReadout'
import { RETARGETED_CLIP_IDS, type RetargetedClipId } from '../catalog/retargetedClips'
import styles from './MotionRetargetScreen.module.css'

function dropFocus(): void {
  const focused = document.activeElement
  if (focused instanceof HTMLElement) focused.blur()
}

function step(frames: number): void {
  dropFocus()
  window.dispatchEvent(new CustomEvent(MOTION_RETARGET_STEP_EVENT, { detail: frames }))
}

export function MotionRetargetScreen() {
  /* eslint-disable no-restricted-syntax -- a button a person presses; nothing here runs per frame. */
  const [clipId, setClipId] = useState<RetargetedClipId>('jump-start')
  const [playing, setPlaying] = useState(true)
  /* eslint-enable no-restricted-syntax */
  const readout = useMemo(() => createRetargetStore(), [])
  const frame = useSyncExternalStore(readout.subscribe, readout.getSnapshot)

  return (
    <div className={styles.screen}>
      <MotionRetargetScene clipId={clipId} key={clipId} playing={playing} readout={readout} />
      <div className={styles.panel}>
        <ControlPanel data-testid="motion-retarget-panel" readout={`${frame.time.toFixed(2)} / ${frame.duration.toFixed(2)} s`} title="Retarget">
          <p className={styles.caption}>Left: the library clip on its own skeleton. Right: the same clip retargeted onto the mannequin.</p>
          <ControlChoice
            activeId={clipId}
            label="Clip"
            onSelect={(id) => {
              dropFocus()
              setClipId(id as RetargetedClipId)
            }}
            options={RETARGETED_CLIP_IDS.map((id) => ({ id, label: id }))}
            testIdPrefix="motion-retarget-clip"
          />
          <div className={styles.actions}>
            <ControlButton active={playing} data-testid="motion-retarget-play" onClick={() => { dropFocus(); setPlaying((value) => !value) }}>
              {playing ? 'Pause' : 'Play'}
            </ControlButton>
            <ControlButton data-testid="motion-retarget-step-back" onClick={() => step(-1)}>Frame -1</ControlButton>
            <ControlButton data-testid="motion-retarget-step" onClick={() => step(1)}>Frame +1</ControlButton>
          </div>
          <div className={styles.numbers} data-testid="motion-retarget-numbers">
            <span>worst limb {frame.worstLimbDegrees.toFixed(1)} deg</span>
            <span>{frame.worstLimb}</span>
            <span>pelvis source {frame.sourcePelvis.toFixed(3)} m</span>
            <span>pelvis target {frame.targetPelvis.toFixed(3)} m</span>
          </div>
        </ControlPanel>
      </div>
    </div>
  )
}
