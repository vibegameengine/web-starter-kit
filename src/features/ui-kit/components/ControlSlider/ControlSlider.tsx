import styles from './ControlSlider.module.css'

type ControlSliderProps = {
  readonly 'data-testid'?: string
  readonly disabled?: boolean
  /** Shown at the start of the row, uppercased by CSS. */
  readonly label: string
  readonly max?: number
  readonly min?: number
  readonly onChange: (value: number) => void
  readonly step?: number
  readonly value: number
  /**
   * Renders the right-hand readout. Defaults to a percentage, which is what a
   * 0–1 fader means to a player; pass one when the number is not a fraction.
   */
  readonly format?: (value: number) => string
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/**
 * The kit's continuous control — a labelled fader with its value beside it.
 *
 * A native `<input type="range">` under kit styling rather than a hand-rolled
 * track: keyboard stepping, page-up/down, screen-reader announcement and touch
 * dragging all come for free and are exactly the parts a custom slider is always
 * missing. The only thing added on top is the lit fill, driven by a `--fill`
 * custom property so the track and the thumb cannot drift apart.
 */
export function ControlSlider({
  'data-testid': testId,
  disabled = false,
  format = percent,
  label,
  max = 1,
  min = 0,
  onChange,
  step = 0.05,
  value,
}: ControlSliderProps) {
  const span = max - min
  const fill = span > 0 ? ((value - min) / span) * 100 : 0

  return (
    <label className={styles.row}>
      <span className={styles.label}>{label}</span>
      <input
        aria-label={label}
        className={styles.input}
        data-testid={testId}
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        type="range"
        value={value}
      />
      <output className={styles.value}>{format(value)}</output>
    </label>
  )
}
