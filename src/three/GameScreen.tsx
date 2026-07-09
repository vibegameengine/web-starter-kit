import { ScalableContainer } from '@vibegameengine/ui-scaler'

import { useReportInitialRenderReady } from '../bootstrap'
import { GameCanvas } from './GameCanvas'
import styles from './GameScreen.module.css'

/**
 * Top-level 3D surface: the greybox starter scene filling the viewport with a
 * scaled HTML overlay on top. This is the generic foundation a game builds on —
 * swap StarterScene for your own world and the warmup-gated preloader,
 * post-processing pipeline and UI scaling come for free.
 */
export function GameScreen() {
  // Dismiss the bootstrap overlay once this screen has painted its first frame.
  useReportInitialRenderReady()

  return (
    <div className={styles.root}>
      <GameCanvas />
      <ScalableContainer targetWidth={1280} zIndex={10}>
        <p className={styles.badge}>3D Starter — drag to orbit</p>
      </ScalableContainer>
    </div>
  )
}
