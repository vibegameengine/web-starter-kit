import { useState } from 'react'

import { useReportInitialRenderReady } from '../../bootstrap'
import type { TanyAnimation } from '../entities/Tany/Tany'
import { CharacterDebugScene } from '../../../scenes/character-debug-scene/CharacterDebugScene'
import styles from './CharacterDebugScreen.module.css'

/**
 * DEV-only screen (route: /character-debug) hosting the same production Tany
 * entity as the game scene. The controls select its bind, idle and Mixamo action
 * states without introducing a second character implementation.
 */
export function CharacterDebugScreen() {
  useReportInitialRenderReady()

  const [animation, setAnimation] = useState<TanyAnimation>('bind')

  return (
    <div className={styles.root}>
      <CharacterDebugScene animation={animation} onGreetingFinished={() => setAnimation('idle')} />

      <div className={styles.panel}>
        <span className={styles.panelTitle}>Pose / Animation</span>
        <button
          type="button"
          className={animation === 'bind' ? styles.itemActive : styles.item}
          onClick={() => setAnimation('bind')}
        >
          Default pose
        </button>
        {[
          ['idle', 'Idle'],
          ['dance', 'Macarena'],
          ['greeting', 'Greeting'],
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={animation === mode ? styles.itemActive : styles.item}
            onClick={() => setAnimation(mode as TanyAnimation)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className={styles.badge}>Character debug — drag to orbit</p>
    </div>
  )
}
