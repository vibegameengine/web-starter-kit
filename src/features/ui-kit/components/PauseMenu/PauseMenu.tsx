import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { ControlButton } from '../ControlButton/ControlButton'
import { ControlPanel } from '../ControlPanel/ControlPanel'
import styles from './PauseMenu.module.css'

export type PauseMenuEntry = {
  readonly id: string
  readonly label: string
}

type PauseMenuProps = {
  /** Which entry's sub-view is showing. `null` shows the list itself. */
  readonly activeEntryId: string | null
  /** The body of the open sub-view. Ignored while the list is showing. */
  readonly children?: ReactNode
  readonly 'data-testid'?: string
  /** The list, in the order it is shown. */
  readonly entries: readonly PauseMenuEntry[]
  readonly hint?: string
  readonly onBack: () => void
  readonly onResume: () => void
  readonly onSelect: (id: string) => void
  readonly resumeLabel?: string
  readonly title?: string
}

/**
 * The game menu: a LIST of entries, with one entry's screen open on top of it.
 *
 * It is a list first and a container second, and that order is the whole point.
 * The first version of this was a single panel with the sound faders dropped
 * straight into it — which is a pause *dialog*, not a pause *menu*, and it has no
 * room for the second thing anyone ever asks for. A menu whose only content is
 * the one screen it was built to reach has already stopped being a menu.
 *
 * Navigation is CONTROLLED — `activeEntryId` in, `onSelect`/`onBack` out —
 * because the kit may not decide where a screen goes, and because a menu holding
 * its own view state cannot be shown in the gallery at the state you want to
 * look at.
 *
 * Rendered as a fixed backdrop INSIDE the caller's overlay tree rather than a
 * portal to `document.body`: a portal escapes the screen's scaler, and a menu
 * that scales differently from the HUD behind it is the first thing that breaks
 * on a phone. The panel itself is `ControlPanel`, not a private frame — a second
 * panel style is how a project ends up with two visual languages.
 */
export function PauseMenu({
  activeEntryId,
  children,
  'data-testid': testId,
  entries,
  hint,
  onBack,
  onResume,
  onSelect,
  resumeLabel = 'Resume',
  title = 'Paused',
}: PauseMenuProps) {
  const panel = useRef<HTMLDivElement>(null)
  const active = entries.find((entry) => entry.id === activeEntryId) ?? null

  // Move focus into the panel whenever the view changes, so the keyboard lands
  // on the list that is actually showing. Without it, focus stays on whatever
  // the game had and Tab walks the HUD behind the backdrop.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button, input')?.focus()
  }, [activeEntryId])

  return (
    <div className={styles.backdrop} data-testid={testId}>
      <div className={styles.frame} ref={panel} role="dialog" aria-label={active ? active.label : title}>
        <ControlPanel maxWidth={340} title={active ? active.label : title}>
          {active ? (
            <>
              <div className={styles.body}>{children}</div>
              <div className={styles.actions}>
                <ControlButton data-testid="pause-back" onClick={onBack}>
                  Back
                </ControlButton>
              </div>
            </>
          ) : (
            <>
              {hint ? <p className={styles.hint}>{hint}</p> : null}
              <nav className={styles.list}>
                {entries.map((entry) => (
                  <ControlButton
                    data-testid={`pause-entry-${entry.id}`}
                    key={entry.id}
                    onClick={() => onSelect(entry.id)}
                  >
                    {entry.label}
                  </ControlButton>
                ))}
                <ControlButton data-testid="pause-resume" onClick={onResume} variant="accent">
                  {resumeLabel}
                </ControlButton>
              </nav>
            </>
          )}
        </ControlPanel>
      </div>
    </div>
  )
}

