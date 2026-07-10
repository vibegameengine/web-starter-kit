import { useReportInitialRenderReady } from '../../bootstrap'
import { CharacterDebugScene } from '../../../scenes/character-debug-scene/CharacterDebugScene'
import styles from './CharacterDebugScreen.module.css'

/**
 * DEV-only screen (route: /character-debug) hosting the character turntable.
 * Reports first-frame readiness so the bootstrap overlay dismisses when this
 * route is loaded directly (the main route dismisses it via GameCanvas instead).
 */
export function CharacterDebugScreen() {
  useReportInitialRenderReady()

  return (
    <div className={styles.root}>
      <CharacterDebugScene />
      <p className={styles.badge}>Character debug — drag to orbit</p>
    </div>
  )
}
