import { ScalableContainer } from '@vibegameengine/ui-scaler'
import type { ReactNode } from 'react'

import { useResponsiveTargetWidth } from '../../../../shared/lib/ui-scale/useResponsiveTargetWidth'
import { DanceControl } from '../DanceControl/DanceControl'
import { GitHubCornerLink } from '../GitHubCornerLink/GitHubCornerLink'
import { StarterKitShowcase } from '../StarterKitShowcase/StarterKitShowcase'
import styles from './DemoSceneHud.module.css'

export type DemoSceneHudLabels = {
  readonly badge: string
  readonly performanceHint: string
  readonly startDanceAriaLabel: string
  readonly startDanceLabel: string
  readonly stopDanceAriaLabel: string
  readonly stopDanceLabel: string
}

export type DemoSceneHudSourceLink = {
  readonly href: string
  readonly label: string
}

type DemoSceneHudProps = {
  readonly children: ReactNode
  readonly isDancing: boolean
  readonly labels: DemoSceneHudLabels
  readonly onDanceToggle: () => void
  readonly sourceLink: DemoSceneHudSourceLink
  readonly uiKitHref: string
}

/**
 * Presentational shell for the starter scene: it owns responsive HUD layout and
 * controls, while the caller supplies the canvas, labels and gameplay callback.
 */
export function DemoSceneHud({ children, isDancing, labels, onDanceToggle, sourceLink, uiKitHref }: DemoSceneHudProps) {
  const targetWidth = useResponsiveTargetWidth({ desktop: 1280, mobilePortrait: 640 })

  return (
    <div className={styles.root}>
      {children}
      <GitHubCornerLink href={sourceLink.href} label={sourceLink.label} />
      <ScalableContainer targetWidth={targetWidth} zIndex={10}>
        <StarterKitShowcase uiKitHref={uiKitHref} />
        <DanceControl
          isDancing={isDancing}
          onToggle={onDanceToggle}
          startAriaLabel={labels.startDanceAriaLabel}
          startLabel={labels.startDanceLabel}
          stopAriaLabel={labels.stopDanceAriaLabel}
          stopLabel={labels.stopDanceLabel}
        />
        <p className={styles.badge}>{labels.badge}</p>
        <p className={styles.performanceHint}>{labels.performanceHint}</p>
      </ScalableContainer>
    </div>
  )
}
