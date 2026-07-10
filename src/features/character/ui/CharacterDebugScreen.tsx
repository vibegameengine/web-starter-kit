import { useState } from 'react'

import { useReportInitialRenderReady } from '../../bootstrap'
import { CharacterDebugScene } from '../../../scenes/character-debug-scene/CharacterDebugScene'
import styles from './CharacterDebugScreen.module.css'

/**
 * DEV-only screen (route: /character-debug) hosting the Tany rig turntable with
 * a pose/animation switcher: "Default pose" holds the bind pose, each clip
 * button plays that animation. Clip names come up from the rig once it loads.
 */
export function CharacterDebugScreen() {
  useReportInitialRenderReady()

  const [clips, setClips] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)

  return (
    <div className={styles.root}>
      <CharacterDebugScene activeClip={active} onClips={setClips} />

      <div className={styles.panel}>
        <span className={styles.panelTitle}>Pose / Animation</span>
        <button
          type="button"
          className={active === null ? styles.itemActive : styles.item}
          onClick={() => setActive(null)}
        >
          Default pose
        </button>
        {clips.map((clip) => (
          <button
            key={clip}
            type="button"
            className={active === clip ? styles.itemActive : styles.item}
            onClick={() => setActive(clip)}
          >
            {clip}
          </button>
        ))}
      </div>

      <p className={styles.badge}>Character debug — drag to orbit</p>
    </div>
  )
}
