import { ControlButton } from '../ControlButton/ControlButton'
import { ControlSlider } from '../ControlSlider/ControlSlider'
import styles from './AudioSettingsControls.module.css'

export type AudioSettingsValues = {
  readonly master: number
  readonly music: number
  readonly sfx: number
  readonly muted: boolean
}

type AudioSettingsControlsProps = {
  readonly 'data-testid'?: string
  readonly onChange: (patch: Partial<AudioSettingsValues>) => void
  readonly values: AudioSettingsValues
}

/**
 * The sound faders, as a presentation-only part.
 *
 * It holds no store and reads no mixer: values in, one patch callback out. That
 * is what lets the pause menu, a main-menu settings page and this component's
 * own preview all show the same control without three of them racing to write
 * the same channel — and what lets the preview be deterministic, which the kit's
 * gallery requires.
 *
 * Muting disables the faders rather than hiding or zeroing them: a player who
 * unmutes expects the levels they left, and a slider that silently snapped to
 * zero while muted is how that expectation gets broken.
 */
export function AudioSettingsControls({
  'data-testid': testId,
  onChange,
  values,
}: AudioSettingsControlsProps) {
  return (
    <div className={styles.group} data-testid={testId}>
      <ControlSlider
        data-testid="audio-master"
        disabled={values.muted}
        label="Master"
        onChange={(master) => onChange({ master })}
        value={values.master}
      />
      <ControlSlider
        data-testid="audio-music"
        disabled={values.muted}
        label="Music"
        onChange={(music) => onChange({ music })}
        value={values.music}
      />
      <ControlSlider
        data-testid="audio-sfx"
        disabled={values.muted}
        label="Effects"
        onChange={(sfx) => onChange({ sfx })}
        value={values.sfx}
      />
      <div className={styles.actions}>
        <ControlButton
          active={values.muted}
          data-testid="audio-mute"
          onClick={() => onChange({ muted: !values.muted })}
        >
          {values.muted ? 'Muted' : 'Mute all'}
        </ControlButton>
      </div>
    </div>
  )
}
