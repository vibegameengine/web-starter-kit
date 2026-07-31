import { type FrameRateCap, type GraphicsQuality } from '../../../../shared/config/graphicsPresets'
import { setFrameRateCap, setGraphicsQuality, useFrameRateCap, useGraphicsQuality, useGraphicsSettings } from '../../../../shared/lib/graphics'
import styles from './StarterKitShowcase.module.css'

const FRAME_CAPS: readonly FrameRateCap[] = [0, 60, 30]
const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ['performance', 'economy']

type StarterKitShowcaseProps = {
  /**
   * Entry into the DEV lab index. Omitted in production builds, where the lab
   * routes do not exist — a link that lands on a redirect back to the scene is
   * worse than no link, because it reads as the feature being broken.
   */
  readonly labsHref?: string
  readonly uiKitHref: string
}

/** Live rendering controls plus direct entries into the UI-kit gallery and DEV labs. */
export function StarterKitShowcase({ labsHref, uiKitHref }: StarterKitShowcaseProps) {
  const quality = useGraphicsQuality()
  const graphics = useGraphicsSettings()
  const frameRateCap = useFrameRateCap()

  return (
    <aside className={styles.root} aria-label="Live starter-kit demonstrations">
      <nav className={styles.entries} aria-label="Isolated surfaces">
        <a className={styles.galleryLink} data-testid="open-ui-kit" href={uiKitHref}>OPEN UI-KIT ↗</a>
        {labsHref ? <a className={styles.galleryLink} data-testid="open-labs" href={labsHref}>OPEN LABS ↗</a> : null}
      </nav>
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
