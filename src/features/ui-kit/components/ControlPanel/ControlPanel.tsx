import type { ReactNode } from 'react'

import styles from './ControlPanel.module.css'

type ControlPanelProps = {
  readonly children: ReactNode
  readonly 'data-testid'?: string
  /** Small uppercase heading. Omit for a panel that needs no title. */
  readonly title?: string
  /** Right-aligned readout beside the title — a mode, a count, a state. */
  readonly readout?: ReactNode
  /** Caps the panel's width; it is otherwise as wide as its content. */
  readonly maxWidth?: number
}

/**
 * The kit's glass control surface: the demo scene's RENDER panel, generalised.
 *
 * It is deliberately the same object at every size — a HUD corner, a lab's
 * control strip, a settings popover — because a second panel style is how a
 * project ends up with two visual languages and no way to tell which is current.
 */
export function ControlPanel({ children, 'data-testid': testId, maxWidth, readout, title }: ControlPanelProps) {
  return (
    <section
      className={styles.panel}
      data-testid={testId}
      style={maxWidth === undefined ? undefined : { maxWidth: `${maxWidth}px` }}
    >
      {title || readout ? (
        <header className={styles.heading}>
          <span>{title}</span>
          {readout ? <output>{readout}</output> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}
