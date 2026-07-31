import { ControlButton } from '../ControlButton/ControlButton'
import styles from './ControlChoice.module.css'

export type ControlChoiceOption = Readonly<{
  disabled?: boolean
  id: string
  label: string
}>

type ControlChoiceProps = {
  readonly activeId: string
  readonly label: string
  readonly onSelect: (id: string) => void
  readonly options: readonly ControlChoiceOption[]
  /** Each option gets `<prefix>-<id>`, so tests target identity, not text. */
  readonly testIdPrefix?: string
}

/**
 * One choice out of a few, as a row of controls — the render-quality and
 * frame-cap switches generalised.
 *
 * A `radiogroup` rather than a nav or a plain div: exactly one option is
 * selected at a time, and that is what the role means. Keyboard users get the
 * group as a single tab stop with the arrow keys moving inside it, which a row
 * of loose buttons does not give them.
 */
export function ControlChoice({ activeId, label, onSelect, options, testIdPrefix = 'choice' }: ControlChoiceProps) {
  return (
    <div aria-label={label} className={styles.row} data-testid={`${testIdPrefix}-group`} role="radiogroup">
      {options.map((option) => (
        <ControlButton
          active={option.id === activeId}
          data-testid={`${testIdPrefix}-${option.id}`}
          disabled={option.disabled}
          key={option.id}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </ControlButton>
      ))}
    </div>
  )
}
