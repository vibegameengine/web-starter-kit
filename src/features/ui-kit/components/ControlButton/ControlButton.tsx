import type { ReactNode } from 'react'

import styles from './ControlButton.module.css'

export type ControlButtonVariant = 'accent' | 'default'

type ControlButtonProps = {
  /** Renders the pressed treatment. Also reported to assistive tech. */
  readonly active?: boolean
  readonly children: ReactNode
  readonly 'data-testid'?: string
  readonly disabled?: boolean
  readonly label?: string
  readonly onClick?: () => void
  /** `accent` for the one action a panel exists for. */
  readonly variant?: ControlButtonVariant
}

/**
 * The kit's small control button: the one used by the render-quality switches on
 * the demo scene, promoted out of that panel so any surface can use it.
 *
 * State is carried by `aria-pressed`, and the pressed look is driven off that
 * attribute in CSS rather than off a second class. One source of truth: a button
 * cannot end up looking active while telling a screen reader it is not.
 */
export function ControlButton({
  active,
  children,
  'data-testid': testId,
  disabled = false,
  label,
  onClick,
  variant = 'default',
}: ControlButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={variant === 'accent' ? styles.accent : styles.button}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}
