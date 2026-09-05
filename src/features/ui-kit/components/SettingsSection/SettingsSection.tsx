import type { ReactNode } from 'react'

import styles from './SettingsSection.module.css'

type SettingsSectionProps = {
  readonly children: ReactNode
  readonly 'data-testid'?: string
  /**
   * One line under the heading for a caveat the controls cannot show — when a
   * setting takes effect, what it costs. Not a description of the obvious.
   */
  readonly note?: string
  readonly title: string
}

/**
 * One labelled block inside a settings screen.
 *
 * It exists so "Settings" can be a screen with SECTIONS — sound, video, and
 * whatever comes next — instead of a screen that is one category wearing the
 * name of the whole. That distinction is the reason this part is separate from
 * the controls it holds: a section knows nothing about what is inside it, so
 * adding a category is adding a section, not editing a settings screen.
 */
export function SettingsSection({ children, 'data-testid': testId, note, title }: SettingsSectionProps) {
  return (
    <section className={styles.section} data-testid={testId}>
      <h3 className={styles.heading}>{title}</h3>
      {note ? <p className={styles.note}>{note}</p> : null}
      <div className={styles.body}>{children}</div>
    </section>
  )
}
