import { useState } from 'react'
import { createPortal } from 'react-dom'

import { compareElementPixels } from '../../systems/pixelDiff'
import styles from './PixelDiffInspector.module.css'

export interface PixelDiffImage {
  readonly alt: string
  readonly name: string
  readonly src: string
}

export interface PixelDiffInspectorProps {
  readonly reference: PixelDiffImage
  readonly target: HTMLElement | null
}

/**
 * In-place visual QA control. It rasterizes the live component and compares the
 * pixels with the prepared reference; matching pixels remain transparent.
 */
export function PixelDiffInspector({ reference, target }: PixelDiffInspectorProps) {
  const [mode, setMode] = useState<'capture' | 'difference' | 'overlay'>()
  const [difference, setDifference] = useState<string>()
  const [error, setError] = useState<string>()

  async function compare() {
    if (!target) return
    setMode('capture')
    setError(undefined)
    try {
      const result = await compareElementPixels(target, reference.src)
      setDifference(result.heatmapSrc)
      setMode('difference')
    } catch (reason) {
      setMode(undefined)
      setError(reason instanceof Error ? reason.message : 'Could not rasterize the current panel.')
    }
  }

  const controlsHost = document.getElementById('ui-kit-inspector-controls')
  const controls = (
    <div className={styles.controls} data-pixel-diff-inspector>
      {!mode && <button className={styles.trigger} type="button" disabled={!target} onClick={() => void compare()}>Compare with reference</button>}
      {mode && <>
        <div className={styles.toolbar} role="toolbar" aria-label="Reference comparison mode">
          <button type="button" disabled={mode === 'capture'} aria-pressed={mode === 'difference'} onClick={() => setMode('difference')}>Pixel heatmap</button>
          <button type="button" aria-pressed={mode === 'overlay'} onClick={() => setMode('overlay')}>Reference overlay</button>
          <button type="button" onClick={() => setMode(undefined)}>Close comparison</button>
        </div>
        <p className={styles.status}>{mode === 'capture' ? 'Rasterizing the current panel…' : mode === 'difference' ? 'Pixel heatmap: yellow and red pixels differ from the prepared reference.' : reference.name}</p>
      </>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )

  return <>{controlsHost && createPortal(controls, controlsHost)}{mode && target && createPortal(
    <div className={styles.overlayRoot} aria-hidden="true">
      {mode === 'difference' && difference && <img className={styles.difference} src={difference} alt="" />}
      {mode === 'overlay' && <img className={styles.overlay} src={reference.src} alt="" />}
    </div>,
    target,
  )}</>
}
