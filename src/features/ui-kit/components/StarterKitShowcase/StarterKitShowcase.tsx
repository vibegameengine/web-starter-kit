import { type FrameRateCap, type GraphicsQuality } from '../../../../shared/config/graphicsPresets'
import { setFrameRateCap, setGraphicsQuality, useFrameRateCap, useGraphicsQuality, useGraphicsSettings } from '../../../../shared/lib/graphics'
import styles from './StarterKitShowcase.module.css'

const FRAME_CAPS: readonly FrameRateCap[] = [0, 60, 30]
const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ['performance', 'economy']

type StarterKitShowcaseProps = {
  readonly uiKitHref: string
}

/** Live rendering controls plus a direct entry into the isolated UI-kit gallery. */
export function StarterKitShowcase({ uiKitHref }: StarterKitShowcaseProps) {
  const quality = useGraphicsQuality()
  const graphics = useGraphicsSettings()
  const frameRateCap = useFrameRateCap()

  return (
    <aside className={styles.root} aria-label="Live starter-kit demonstrations">
      <a className={styles.galleryLink} href={uiKitHref}>OPEN UI-KIT ↗</a>
      <section className={styles.render} aria-label="Render controls">
        <div className={styles.renderHeading}>
          <span>RENDER</span>
          <output>{graphics.dpr === 1 ? 'FULL' : 'ECO'} / {frameRateCap === 0 ? '∞' : frameRateCap}</output>
        </div>
        <div className={styles.qualityChoice} aria-label="Graphics quality">
          {GRAPHICS_QUALITIES.map((value) => <button key={value} type="button" aria-pressed={quality === value} onClick={() => setGraphicsQuality(value)}>{value === 'performance' ? 'FULL' : 'ECO'}</button>)}
        </div>
        <div className={styles.capChoice} aria-label="Frame rate cap">
          {FRAME_CAPS.map((value) => <button key={value} type="button" aria-pressed={frameRateCap === value} onClick={() => setFrameRateCap(value)}>{value === 0 ? '∞' : value}</button>)}
        </div>
      </section>

    </aside>
  )
}
