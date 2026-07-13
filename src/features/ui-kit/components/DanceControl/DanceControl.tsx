import { Patch9Button } from '../Patch9Button/Patch9Button'
import danceButtonFrameUrl from './assets/dance-button-frame.generated.png'
import styles from './DanceControl.module.css'

const DANCE_BUTTON_PATCH = {
  border: { bottom: 22, left: 26, right: 26, top: 22 },
  image: danceButtonFrameUrl,
  slice: { bottom: 34, left: 34, right: 34, top: 34 },
  textColor: '#fff2cc',
} as const

type DanceControlProps = {
  readonly isDancing: boolean
  readonly onToggle: () => void
  readonly startAriaLabel: string
  readonly startLabel: string
  readonly stopAriaLabel: string
  readonly stopLabel: string
}

/** Presentation-only Patch9 action; the caller owns dance state and audio. */
export function DanceControl({
  isDancing,
  onToggle,
  startAriaLabel,
  startLabel,
  stopAriaLabel,
  stopLabel,
}: DanceControlProps) {
  return (
    <Patch9Button
      aria-label={isDancing ? stopAriaLabel : startAriaLabel}
      aria-pressed={isDancing}
      className={styles.button}
      onClick={onToggle}
      patch9={DANCE_BUTTON_PATCH}
    >
      {isDancing ? stopLabel : startLabel}
    </Patch9Button>
  )
}
